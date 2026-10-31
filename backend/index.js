require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const mqtt = require('mqtt');

const User = require('./models/User');
const Device = require('./models/Device');
const Settings = require('./models/Settings');
const { authenticate, requireAdmin, JWT_SECRET } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, credentials: true }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iot-platform';

// ─── MQTT Broker Setup ────────────────────────────────────────────────────────
// MQTT_BROKER is how *this server* reaches the broker. Hugging Face Spaces only
// allow outbound ports 80/443, so there use a WebSocket URL on 443
// (e.g. wss://public.cloud.shiftr.io:443). Devices connect over plain TCP to
// MQTT_DEVICE_HOST:MQTT_DEVICE_PORT (defaults: the broker's host, port 1883).
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://broker.hivemq.com';
const MQTT_USERNAME = process.env.MQTT_USERNAME || '';
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || '';
const MQTT_DEVICE_HOST = process.env.MQTT_DEVICE_HOST || new URL(MQTT_BROKER).hostname;
const MQTT_DEVICE_PORT = parseInt(process.env.MQTT_DEVICE_PORT || '1883', 10);
let mqttLastError = null;

const mqttClient = mqtt.connect(MQTT_BROKER, {
    username: MQTT_USERNAME || undefined,
    password: MQTT_PASSWORD || undefined,
    clientId: `ioiot-backend-${crypto.randomBytes(4).toString('hex')}`,
    keepalive: 60,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
});

mqttClient.on('connect', () => {
    console.log(`MQTT connected to ${MQTT_BROKER}`);
    // Subscribe to all device state reports and status (LWT) topics
    mqttClient.subscribe('ioiot/+/state', { qos: 1 });
    mqttClient.subscribe('ioiot/+/status', { qos: 1 });
});

mqttClient.on('error', (err) => {
    mqttLastError = err.message;
    console.error('MQTT error:', err.message);
});

mqttClient.on('reconnect', () => {
    console.log('MQTT reconnecting...');
});

// ─── MQTT Message Signing ────────────────────────────────────────────────────
// The broker is public, so every payload is signed with the device's authToken:
//   "<hmac>|<session>|<seq>|<json>", hmac = HMAC-SHA256(authToken, "<kind>|<session>|<seq>|<json>")
// kind is the last topic segment (command | config | state | status). The device
// picks a random session on each boot and only accepts increasing seq numbers, so
// captured commands can't be replayed. Must match frontend/src/utils/mqttSigning.js.
const deviceSessions = new Map(); // deviceId -> { session, lastSeq } learned from the device
const lastSentSeq = new Map();    // deviceId -> last seq we sent to it

const hmacHex = (token, kind, session, seq, json) =>
    crypto.createHmac('sha256', token).update(`${kind}|${session}|${seq}|${json}`).digest('hex');

function verifySignedMessage(token, kind, payload) {
    const m = /^([0-9a-f]{64})\|([0-9a-f]{16})\|(\d{1,20})\|([\s\S]*)$/.exec(payload.toString());
    if (!m) return null;
    const [, mac, session, seq, json] = m;
    const expected = Buffer.from(hmacHex(token, kind, session, seq, json));
    if (!crypto.timingSafeEqual(expected, Buffer.from(mac))) return null;
    try { return { session, seq: BigInt(seq), data: JSON.parse(json) }; } catch { return null; }
}

// Publish a signed message to a device. Returns false if the device hasn't
// checked in since this server started (we don't know its session yet).
function publishSigned(device, kind, obj) {
    const known = deviceSessions.get(device.deviceId);
    if (!known) {
        console.warn(`MQTT: no session for ${device.deviceId} yet — is the device online with signed firmware?`);
        return false;
    }
    const seq = Math.max(Date.now(), (lastSentSeq.get(device.deviceId) || 0) + 1);
    lastSentSeq.set(device.deviceId, seq);
    const json = JSON.stringify(obj);
    const payload = `${hmacHex(device.authToken, kind, known.session, seq, json)}|${known.session}|${seq}|${json}`;
    mqttClient.publish(`ioiot/${device.deviceId}/${kind}`, payload, { qos: 1, retain: false });
    return true;
}

// ─── MQTT → Socket.io Bridge ──────────────────────────────────────────────────
// When ESP32 publishes state/sensor data, forward to web dashboard via socket.io
mqttClient.on('message', async (topic, payload) => {
    try {
        const parts = topic.split('/'); // ['ioiot', deviceId, 'state'|'status']
        if (parts.length < 3 || parts[0] !== 'ioiot') return;

        const deviceId = parts[1];
        const type = parts[2];
        if (type !== 'state' && type !== 'status') return;

        const device = await Device.findOne({ deviceId });
        if (!device) return;

        // Drop anything not signed by this device (forged, old firmware, or garbage)
        const msg = verifySignedMessage(device.authToken, type, payload);
        if (!msg) return;

        const known = deviceSessions.get(deviceId);
        const isLwt = type === 'status' && msg.data.online === false;
        if (isLwt) {
            // The offline will is signed once at connect time, so only check its session
            if (!known || known.session !== msg.session) return;
        } else if (known && known.session === msg.session) {
            if (msg.seq <= known.lastSeq) return; // replayed
            known.lastSeq = msg.seq;
        } else {
            // New boot (or we restarted) — adopt the device's new session and
            // push the pin config so Universal Firmware boards work right after flashing
            deviceSessions.set(deviceId, { session: msg.session, lastSeq: msg.seq });
            publishSigned(device, 'config', { pins: device.pins });
        }

        const data = msg.data;

        if (type === 'state') {
            // Device is alive — mark online and process sensor values
            const wasOffline = !device.isConnected;
            device.isConnected = true;
            device.lastSeen = new Date();

            // Update INPUT pin values from device reports
            const stateChanges = {};
            Object.entries(data).forEach(([key, val]) => {
                const pin = device.pins.find(p => p.widgetKey === key);
                if (pin && pin.mode !== 'OUTPUT') { // INPUT and INPUT_PULLUP
                    pin.value = val;
                    device.state.set(key, val);
                    stateChanges[key] = val;
                }
            });

            await device.save();

            if (wasOffline) {
                io.to(deviceRoom(deviceId)).emit('deviceStatusUpdate', { deviceId, isConnected: true });
            }

            if (Object.keys(stateChanges).length > 0) {
                io.to(deviceRoom(deviceId)).emit('deviceStateUpdate', {
                    deviceId,
                    state: Object.fromEntries(device.state)
                });
            }

        } else {
            // Status / LWT — device went offline or came online
            const online = data.online === true;
            const changed = device.isConnected !== online;
            if (changed) {
                device.isConnected = online;
                if (online) device.lastSeen = new Date();
                await device.save();
                io.to(deviceRoom(deviceId)).emit('deviceStatusUpdate', { deviceId, isConnected: online });
            }
        }
    } catch (err) {
        console.error('MQTT message handler error:', err);
    }
});

// Helper: publish a signed command to a device via MQTT
function publishCommand(device, widgetKey, value) {
    return publishSigned(device, 'command', { [widgetKey]: value });
}

// Socket.io room for a device — only its owner, admins and (for live devices) viewers join it
const deviceRoom = (deviceId) => `device:${deviceId}`;

const isOwnerOrAdmin = (device, user) => {
    const ownerId = (device.owner?._id || device.owner)?.toString();
    return ownerId === user.id || user.role === 'admin';
};

// ─── Connect to MongoDB ──────────────────────────────────────────────────────
mongoose.connect(MONGO_URI).then(async () => {
    console.log('MongoDB connected');

    // Seed admin only when ADMIN_PASSWORD is provided (no hardcoded passwords)
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists && process.env.ADMIN_PASSWORD) {
        const hashedAdmin = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
        const admin = await User.create({ username: 'admin', password: hashedAdmin, role: 'admin', isApproved: true });
        console.log('Admin user seeded');

        // Seed demo device for admin
        const demoDevice = await Device.findOne({ deviceId: 'device-001' });
        if (!demoDevice) {
            await Device.create({
                deviceId: 'device-001',
                name: 'RC Plane Demo',
                owner: admin._id,
                pins: [
                    { pinNumber: 18, label: 'Green LED', mode: 'OUTPUT', type: 'digital', widgetType: 'toggle', widgetKey: 'ledG', value: false, color: '#22c55e' },
                    { pinNumber: 19, label: 'Blue LED', mode: 'OUTPUT', type: 'digital', widgetType: 'toggle', widgetKey: 'ledB', value: false, color: '#3b82f6' },
                    { pinNumber: 21, label: 'Red LED', mode: 'OUTPUT', type: 'digital', widgetType: 'toggle', widgetKey: 'ledR', value: false, color: '#ef4444' },
                    { pinNumber: 22, label: 'Strobe Flash', mode: 'OUTPUT', type: 'digital', widgetType: 'toggle', widgetKey: 'flash', value: false, color: '#eab308' },
                    { pinNumber: 23, label: 'Motor / ESC', mode: 'OUTPUT', type: 'pwm', widgetType: 'slider', widgetKey: 'motor', value: 0, min: 0, max: 255, color: '#a855f7' },
                ],
                state: { ledG: false, ledB: false, ledR: false, flash: false, motor: 0 }
            });
            console.log('RC Plane demo device seeded');
        }
    }
}).catch(err => console.error('MongoDB connection error', err));

// ─── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    try {
        let { username, password } = req.body;
        username = username?.trim();
        const exists = await User.findOne({ username });
        if (exists) return res.status(400).json({ error: 'Username already exists' });
        
        // Check global autoApprove setting
        let isApproved = false;
        const autoApproveSetting = await Settings.findOne({ key: 'autoApprove' });
        if (autoApproveSetting && autoApproveSetting.value === true) {
            isApproved = true;
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword, role: 'user', isApproved });
        await user.save();
        
        if (isApproved) {
            res.status(201).json({ message: 'Registration successful, account auto-approved.' });
        } else {
            res.status(201).json({ message: 'Registration successful, pending admin approval.' });
        }
    } catch (error) {
        res.status(500).json({ error: 'Registration failed' });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        let { username, password } = req.body;
        username = username?.trim();
        const user = await User.findOne({ username });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        if (!user.isApproved) {
            return res.status(403).json({ error: 'Account not approved yet' });
        }
        const token = jwt.sign({ id: user._id, role: user.role, username: user.username }, JWT_SECRET);
        res.json({ token, role: user.role, username: user.username, userId: user._id, walletBalance: user.walletBalance || 0, profile: user.profile });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// ─── Change Password ──────────────────────────────────────────────────────────
app.post('/api/auth/change-password', authenticate, async (req, res) => {
    try {
        const { oldPassword, newPassword } = req.body;
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const match = await bcrypt.compare(oldPassword, user.password);
        if (!match) return res.status(400).json({ error: 'Current password is incorrect' });
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// ─── Profile ─────────────────────────────────────────────────────────────────
app.get('/api/profile', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json({ username: user.username, role: user.role, profile: user.profile });
    } catch (err) {
        res.status(500).json({ error: 'Failed to load profile' });
    }
});

app.put('/api/profile', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        const { displayName, bio, avatarColor, betaMode, notifications } = req.body;
        if (typeof displayName === 'string') user.profile.displayName = displayName.slice(0, 50);
        if (typeof bio === 'string') user.profile.bio = bio.slice(0, 300);
        if (typeof avatarColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(avatarColor)) user.profile.avatarColor = avatarColor;
        if (typeof betaMode === 'boolean') user.profile.betaMode = betaMode;
        if (typeof notifications === 'boolean') user.profile.notifications = notifications;
        await user.save();
        res.json({ profile: user.profile });
    } catch (err) {
        res.status(500).json({ error: 'Failed to save profile' });
    }
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
    try {
        const users = await User.find({}, '-password').sort({ createdAt: -1 });
        res.json(users);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch users' }); }
});

// Settings Endpoints
app.get('/api/admin/settings', authenticate, requireAdmin, async (req, res) => {
    try {
        const settings = await Settings.find({});
        res.json(settings);
    } catch (error) { res.status(500).json({ error: 'Failed to fetch settings' }); }
});

app.put('/api/admin/settings', authenticate, requireAdmin, async (req, res) => {
    try {
        const { key, value } = req.body;
        if (!key) return res.status(400).json({ error: 'Setting key is required' });
        
        await Settings.findOneAndUpdate(
            { key },
            { value },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (error) { res.status(500).json({ error: 'Failed to update setting' }); }
});

// Admin create user directly
app.post('/api/admin/users/create', authenticate, requireAdmin, async (req, res) => {
    try {
        let { username, password, role } = req.body;
        username = username?.trim();
        if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
        const exists = await User.findOne({ username });
        if (exists) return res.status(400).json({ error: 'Username already exists' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = await User.create({ username, password: hashedPassword, role: role || 'user', isApproved: true });
        res.status(201).json({ message: 'User created', user: { _id: user._id, username: user.username, role: user.role, isApproved: true } });
    } catch (err) {
        res.status(500).json({ error: 'Failed to create user' });
    }
});

// Admin send push notification to all connected clients
app.post('/api/admin/notify', authenticate, requireAdmin, async (req, res) => {
    try {
        const { title, message, type } = req.body;
        if (!message) return res.status(400).json({ error: 'Message required' });
        io.emit('adminNotification', { title: title || 'System Notice', message, type: type || 'info', timestamp: new Date() });
        res.json({ message: 'Notification sent to all connected users' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send notification' });
    }
});

app.post('/api/admin/users/:id/approve', authenticate, requireAdmin, async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { isApproved: true });
    res.json({ message: 'User approved' });
});

app.delete('/api/admin/users/:id', authenticate, requireAdmin, async (req, res) => {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'User deleted' });
});

// Admin can see ALL devices across all users
app.get('/api/admin/devices', authenticate, requireAdmin, async (req, res) => {
    const devices = await Device.find().populate('owner', 'username role');
    res.json(devices);
});

// ─── Device Routes ─────────────────────────────────────────────────────────────
app.get('/api/devices', authenticate, async (req, res) => {
    try {
        let devices;
        if (req.user.role === 'admin') {
            devices = await Device.find().populate('owner', 'username');
        } else {
            devices = await Device.find({
                $or: [{ owner: req.user.id }, { isLive: true }]
            }).populate('owner', 'username');
        }
        res.json(devices.map(d => {
            if (isOwnerOrAdmin(d, req.user)) return d;
            const { authToken, wifiSSID, wifiPassword, latestFirmware, ...rest } = d.toObject();
            return rest;
        }));
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

// Create device
app.post('/api/devices', authenticate, async (req, res) => {
    try {
        const { name, mode, board } = req.body;
        console.log('Creating device:', { name, mode, board, user: req.user.id });
        const deviceId = `device-${crypto.randomBytes(4).toString('hex')}`;
        const device = await Device.create({
            deviceId,
            name: name || 'My New Device',
            mode: mode || 'mqtt',
            board: board || 'esp32',
            owner: req.user.id,
            pins: [],
            state: {}
        });
        console.log('Device created:', device.deviceId);
        res.status(201).json(device);
    } catch (err) {
        console.error('Create device error:', err.message, err.name);
        res.status(500).json({ error: 'Failed to create device', detail: err.message });
    }
});

// Update device (name, WiFi credentials, mode)
app.put('/api/devices/:id', authenticate, async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        const ownerIdPut = (device.owner?._id || device.owner)?.toString();
        if (ownerIdPut !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });

        const { name, wifiSSID, wifiPassword, mode, isLive, otaEnabled, board } = req.body;
        if (name !== undefined) device.name = name;
        if (wifiSSID !== undefined) device.wifiSSID = wifiSSID;
        if (wifiPassword !== undefined) device.wifiPassword = wifiPassword;
        if (mode !== undefined) device.mode = mode;
        if (otaEnabled !== undefined) device.otaEnabled = otaEnabled;
        if (board !== undefined) device.board = board;
        if (isLive !== undefined && req.user.role === 'admin') device.isLive = isLive;
        await device.save();
        res.json(device);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
});

// Admin toggle device live/public status
app.post('/api/devices/:id/live', authenticate, requireAdmin, async (req, res) => {
    try {
        console.log('Toggle live for device:', req.params.id, 'by admin:', req.user.id);
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        device.isLive = !device.isLive;
        await device.save();
        console.log('Device', device.deviceId, 'isLive now:', device.isLive);
        io.to('admins').emit('deviceLiveUpdate', { deviceId: device.deviceId, isLive: device.isLive });
        res.json({ isLive: device.isLive });
    } catch (err) {
        console.error('Toggle live error:', err);
        res.status(500).json({ error: 'Failed to toggle live status', detail: err.message });
    }
});

// Delete device
app.delete('/api/devices/:id', authenticate, async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        const ownerIdDel = (device.owner?._id || device.owner)?.toString();
        if (ownerIdDel !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });
        await device.deleteOne();
        res.json({ message: 'Device deleted' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Delete failed' });
    }
});

// Update all pins config (replaces entire pins array)
app.put('/api/devices/:id/pins', authenticate, async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        const ownerId = (device.owner?._id || device.owner)?.toString();
        if (ownerId !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });

        const { pins } = req.body;
        device.pins = pins;
        pins.forEach(p => device.state.set(p.widgetKey, p.value));
        await device.save();
        io.to(deviceRoom(device.deviceId)).emit('deviceConfigUpdate', { deviceId: device.deviceId, pins: device.pins });
        
        if (device.mode === 'wifi' && mqttClient?.connected) {
            publishSigned(device, 'config', { pins: device.pins });
        }
        
        res.json(device);
    } catch (err) {
        console.error('Pin save error:', err);
        res.status(500).json({ error: 'Failed to update pins', detail: err.message });
    }
});

// Save/replace all custom actions for a device
app.put('/api/devices/:id/actions', authenticate, async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        const ownerId = (device.owner?._id || device.owner)?.toString();
        if (ownerId !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });

        device.customActions = req.body.customActions || [];
        device.markModified('customActions');
        await device.save();
        io.to(deviceRoom(device.deviceId)).emit('deviceActionsUpdate', { deviceId: device.deviceId, customActions: device.customActions });
        res.json({ customActions: device.customActions });
    } catch (err) {
        console.error('Actions save error:', err);
        res.status(500).json({ error: 'Failed to update actions', detail: err.message });
    }
});

// Control a pin (toggle or set value) — REST endpoint
app.post('/api/devices/:id/control', authenticate, async (req, res) => {
    try {
        const { widgetKey, value } = req.body;
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        const ownerIdCtrl = (device.owner?._id || device.owner)?.toString();
        if (ownerIdCtrl !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });

        const pinIndex = device.pins.findIndex(p => p.widgetKey === widgetKey);
        if (pinIndex !== -1) device.pins[pinIndex].value = value;

        device.state.set(widgetKey, value);
        device.markModified('pins');

        // Publish to MQTT immediately
        publishCommand(device, widgetKey, value);

        // Notify web clients via socket.io
        io.to(deviceRoom(device.deviceId)).emit('deviceStateUpdate', {
            deviceId: device.deviceId,
            widgetKey,
            value,
            state: Object.fromEntries(device.state)
        });

        await device.save();
        res.json({ widgetKey, value });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Control failed' });
    }
});

// Legacy toggle (kept for backward compat)
app.post('/api/devices/:id/toggle', authenticate, async (req, res) => {
    try {
        const { toggleType, state } = req.body;
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (!isOwnerOrAdmin(device, req.user)) return res.status(403).json({ error: 'Unauthorized' });

        device.state.set(toggleType, state);
        const pin = device.pins.find(p => p.widgetKey === toggleType);
        if (pin) pin.value = state;

        // Publish to MQTT
        publishCommand(device, toggleType, state);

        io.to(deviceRoom(device.deviceId)).emit('deviceStateUpdate', {
            deviceId: device.deviceId,
            widgetKey: toggleType,
            value: state,
            state: Object.fromEntries(device.state)
        });

        await device.save();
        res.json(device);
    } catch (err) {
        res.status(500).json({ error: 'Toggle failed' });
    }
});

// ─── Keep-Alive & Misc ────────────────────────────────────────────────────────
app.get('/api/ping', (req, res) => {
    res.json({
        status: 'active',
        timestamp: new Date(),
        mqtt: { connected: mqttClient.connected, broker: new URL(MQTT_BROKER).host, lastError: mqttClient.connected ? null : mqttLastError },
    });
});

// Broker settings baked into generated firmware (so devices and server use the same broker).
// Every device shares these credentials; commands are still protected by per-device signing.
app.get('/api/mqtt-config', authenticate, (req, res) => {
    res.json({ host: MQTT_DEVICE_HOST, port: MQTT_DEVICE_PORT, username: MQTT_USERNAME, password: MQTT_PASSWORD });
});

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    // Clients must subscribe per device; updates are only sent to authorized rooms
    socket.on('watchDevice', async ({ deviceId, token } = {}) => {
        try {
            const user = jwt.verify(token, JWT_SECRET);
            const device = await Device.findOne({ deviceId });
            if (!device) return;
            if (isOwnerOrAdmin(device, user) || device.isLive) socket.join(deviceRoom(deviceId));
        } catch { }
    });

    socket.on('unwatchDevice', ({ deviceId } = {}) => {
        socket.leave(deviceRoom(deviceId));
    });

    socket.on('watchAdmin', ({ token } = {}) => {
        try {
            const user = jwt.verify(token, JWT_SECRET);
            if (user.role === 'admin') socket.join('admins');
        } catch { }
    });

    // --- INSTANT CONTROL VIA SOCKETS (Web → MQTT → ESP32) ---
    socket.on('sendControl', async (data) => {
        try {
            const { deviceId, widgetKey, value, token } = data;

            // Validate token
            const decoded = jwt.verify(token, JWT_SECRET);
            const user = await User.findById(decoded.id);
            if (!user) return;

            const device = await Device.findOne({ deviceId });
            if (!device) return;

            // Auth check
            if (!isOwnerOrAdmin(device, { id: user._id.toString(), role: user.role })) return;

            // Update pin value
            const pinIndex = device.pins.findIndex(p => p.widgetKey === widgetKey);
            if (pinIndex !== -1) device.pins[pinIndex].value = value;

            device.state.set(widgetKey, value);
            device.markModified('pins');

            // 1. Publish command to MQTT broker → ESP32 gets it instantly
            publishCommand(device, widgetKey, value);

            // 2. Broadcast to all web clients via socket.io
            io.to(deviceRoom(deviceId)).emit('deviceStateUpdate', {
                deviceId,
                widgetKey,
                value,
                state: Object.fromEntries(device.state)
            });

            // 3. Persist to DB
            await device.save();
        } catch (err) {
            console.error('Socket control error:', err);
        }
    });

    socket.on('disconnect', () => { });
});

// ─── InkQueue Routes ──────────────────────────────────────────────────────────
app.use('/api/inkqueue', require('./routes/inkqueue'));

// Basic health check
app.get('/', (req, res) => {
    res.send('<h1>IoIoT Platform v2.0 — MQTT</h1><p>Status: <span style="color: green;">Online</span></p><p>Backend is running on Hugging Face Spaces.</p>');
});

// ─── ESP32 Compile Endpoint ──────────────────────────────────────────────────
// Public (used by the Web Editor), so cap code size and concurrent compiles
const MAX_CODE_BYTES = 256 * 1024;
const MAX_CONCURRENT_COMPILES = 3;
const FQBN_PATTERN = /^[a-z0-9_-]+:[a-z0-9_-]+:[A-Za-z0-9_-]+(:[A-Za-z0-9_=,.-]+)?$/;
const activeCompiles = new Set(); // client IPs with a compile in progress

app.post('/api/compile', async (req, res) => {
    const { code, board = 'esp32:esp32:esp32' } = req.body;
    if (typeof code !== 'string' || !code.trim()) {
        return res.status(400).json({ error: 'No code provided' });
    }
    if (Buffer.byteLength(code, 'utf8') > MAX_CODE_BYTES) {
        return res.status(413).json({ error: 'Code is too large to compile' });
    }
    if (typeof board !== 'string' || !FQBN_PATTERN.test(board)) {
        return res.status(400).json({ error: 'Invalid board' });
    }

    const clientIp = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    if (activeCompiles.has(clientIp)) {
        return res.status(429).json({ error: 'A compile is already running. Please wait for it to finish.' });
    }
    if (activeCompiles.size >= MAX_CONCURRENT_COMPILES) {
        return res.status(503).json({ error: 'Compile server is busy. Please try again in a minute.' });
    }

    const checkCli = spawn('which', ['arduino-cli']);
    const cliAvailable = await new Promise(r => checkCli.on('close', c => r(c === 0)));
    if (!cliAvailable) {
        return res.status(503).json({ error: 'Compilation service not available. arduino-cli is not installed on this server.' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const sse = (type, data) => {
        try { res.write(`data: ${JSON.stringify({ type, data })}\n\n`); } catch { }
    };

    activeCompiles.add(clientIp);
    res.on('close', () => activeCompiles.delete(clientIp));

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ioiot-'));
    const sketchName = 'ioiot_device';
    const sketchDir = path.join(tempDir, sketchName);
    const buildDir = path.join(tempDir, 'build');

    try {
        fs.mkdirSync(sketchDir, { recursive: true });
        fs.mkdirSync(buildDir, { recursive: true });
        fs.writeFileSync(path.join(sketchDir, `${sketchName}.ino`), code, 'utf8');
    } catch (err) {
        sse('error', `Failed to create temp files: ${err.message}`);
        res.end();
        return;
    }

    sse('log', `🔨 Compiling for board: ${board}`);
    sse('log', '⏳ First compile may take 30–90 seconds (subsequent compiles are fast due to caching)...');

    const child = spawn('arduino-cli', [
        'compile',
        '--fqbn', board,
        '--output-dir', buildDir,
        '--warnings', 'none',
        sketchDir
    ]);

    child.stdout.on('data', (data) => {
        data.toString().split('\n').filter(l => l.trim()).forEach(l => sse('log', l.trim()));
    });
    child.stderr.on('data', (data) => {
        data.toString().split('\n').filter(l => l.trim()).forEach(l => {
            const line = l.trim();
            if (!line.startsWith('Using board') && !line.startsWith('Using cache') && !line.includes('Skipping') && !line.includes('DEBUG')) {
                sse('log', line);
            }
        });
    });

    child.on('close', async (exitCode) => {
        if (exitCode !== 0) {
            sse('error', '❌ Compilation failed. Check the code for errors.');
            res.end();
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { }
            return;
        }

        try {
            const buildFiles = fs.readdirSync(buildDir);
            const sketchBinName = buildFiles.find(f => f.endsWith('.bin') && !f.includes('bootloader') && !f.includes('partition'));
            const bootloaderName = buildFiles.find(f => f.includes('bootloader') && f.endsWith('.bin'));
            const partitionsName = buildFiles.find(f => f.includes('partition') && f.endsWith('.bin'));

            if (!sketchBinName) {
                sse('error', 'Compiled binary not found in output directory.');
                res.end();
                try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { }
                return;
            }

            const readBin = (name) => {
                try { return fs.readFileSync(path.join(buildDir, name)).toString('base64'); }
                catch { return null; }
            };

            let bootApp0Data = null;
            try {
                const bootApp0Path = fs.readFileSync('/boot_app0_path.txt', 'utf8').trim();
                if (bootApp0Path && fs.existsSync(bootApp0Path)) {
                    bootApp0Data = fs.readFileSync(bootApp0Path).toString('base64');
                }
            } catch { }

            const flashFiles = [];

            let bootloaderAddress = 0x1000;
            let sketchAddress = 0x10000;

            if (board.includes('esp32c3') || board.includes('esp32s3')) {
                bootloaderAddress = 0x0000;
            } else if (board.includes('esp8266')) {
                sketchAddress = 0x0000;
            }

            if (board.includes('esp32')) {
                const isC3OrS3 = board.includes('esp32c3') || board.includes('esp32s3');
                if (bootloaderName) flashFiles.push({ address: bootloaderAddress, data: readBin(bootloaderName), name: 'Bootloader' });
                if (partitionsName) flashFiles.push({ address: 0x8000, data: readBin(partitionsName), name: 'Partition Table' });
                if (bootApp0Data && !isC3OrS3) flashFiles.push({ address: 0xe000, data: bootApp0Data, name: 'Boot App0' });
            }
            flashFiles.push({ address: sketchAddress, data: readBin(sketchBinName), name: 'Sketch' });

            const validFiles = flashFiles.filter(f => f.data);
            const sketchSize = fs.statSync(path.join(buildDir, sketchBinName)).size;

            sse('log', `✅ Compiled successfully! Sketch: ${(sketchSize / 1024).toFixed(1)} KB · ${validFiles.length} files to flash`);
            sse('binary', { files: validFiles, board });
        } catch (err) {
            sse('error', `Post-compile error: ${err.message}`);
        }

        res.end();
        try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch { }
    });

    req.on('close', () => {
        try { child.kill('SIGTERM'); } catch { }
    });
});

// ─── OTA Firmware Storage ────────────────────────────────────────────────────
const firmwareDir = path.join(__dirname, 'firmware');
if (!fs.existsSync(firmwareDir)) fs.mkdirSync(firmwareDir);

app.post('/api/devices/:id/firmware', authenticate, async (req, res) => {
    try {
        const { binary, version } = req.body;
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        const ownerId = (device.owner?._id || device.owner)?.toString();
        if (ownerId !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });

        const filePath = path.join(firmwareDir, `${device.deviceId}.bin`);
        fs.writeFileSync(filePath, Buffer.from(binary, 'base64'));

        device.latestFirmware = {
            version: version || Date.now().toString(),
            filePath: filePath,
            uploadedAt: new Date()
        };
        await device.save();

        res.json({ message: 'Firmware uploaded successfully', version: device.latestFirmware.version });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Firmware upload failed' });
    }
});

// Devices must pass their authToken: GET /api/esp/ota/:id?token=<authToken>
app.get('/api/esp/ota/:id', async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.id });
        const token = String(req.query.token || req.header('x-device-token') || '');
        const expected = Buffer.from(device?.authToken || '');
        const given = Buffer.from(token);
        if (!device || given.length !== expected.length || !crypto.timingSafeEqual(given, expected))
            return res.status(401).send('Unauthorized');
        if (!device.latestFirmware) return res.status(404).send('No firmware');
        res.sendFile(device.latestFirmware.filePath);
    } catch (err) {
        res.status(500).send('Server error');
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`IoIoT Server running on port ${PORT}`));
