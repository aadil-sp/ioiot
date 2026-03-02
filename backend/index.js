require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const User = require('./models/User');
const Device = require('./models/Device');
const { authenticate, requireAdmin } = require('./middleware/auth');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: true, credentials: true }
});

app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/iot-platform';

// ─── Connect to MongoDB ──────────────────────────────────────────────────────
mongoose.connect(MONGO_URI).then(async () => {
    console.log('MongoDB connected');

    // Seed admin
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
        const hashedAdmin = await bcrypt.hash('admin@123', 10);
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

    const userExists = await User.findOne({ username: 'abhiram' });
    if (!userExists) {
        const hashedUser = await bcrypt.hash('abhiram@123', 10);
        await User.create({ username: 'abhiram', password: hashedUser, role: 'user', isApproved: true });
        console.log('Test user abhiram seeded');
    }
}).catch(err => console.error('MongoDB connection error', err));

// ─── Auth Routes ─────────────────────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
    try {
        let { username, password } = req.body;
        username = username?.trim();
        const exists = await User.findOne({ username });
        if (exists) return res.status(400).json({ error: 'Username already exists' });
        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ username, password: hashedPassword, role: 'user', isApproved: false });
        await user.save();
        res.status(201).json({ message: 'Registration successful, pending admin approval.' });
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
        res.json({ token, role: user.role, username: user.username });
    } catch (error) {
        res.status(500).json({ error: 'Login failed' });
    }
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
    const users = await User.find({}, '-password');
    res.json(users);
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
// Get devices: own devices for users, all for admins
app.get('/api/devices', authenticate, async (req, res) => {
    try {
        const query = req.user.role === 'admin' ? {} : { owner: req.user.id };
        const devices = await Device.find(query).populate('owner', 'username');
        res.json(devices);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch devices' });
    }
});

// Create device
app.post('/api/devices', authenticate, async (req, res) => {
    try {
        const { name, mode } = req.body;
        const deviceId = `device-${crypto.randomBytes(4).toString('hex')}`;
        const device = await Device.create({
            deviceId,
            name: name || 'My New Device',
            mode: mode || 'wifi',
            owner: req.user.id,
            pins: [],
            state: {}
        });
        res.status(201).json(device);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to create device' });
    }
});

// Update device (name, WiFi credentials, mode)
app.put('/api/devices/:id', authenticate, async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (device.owner._id.toString() !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });

        const { name, wifiSSID, wifiPassword, mode } = req.body;
        if (name !== undefined) device.name = name;
        if (wifiSSID !== undefined) device.wifiSSID = wifiSSID;
        if (wifiPassword !== undefined) device.wifiPassword = wifiPassword;
        if (mode !== undefined) device.mode = mode;
        await device.save();
        res.json(device);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Update failed' });
    }
});

// Delete device
app.delete('/api/devices/:id', authenticate, async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        if (device.owner._id.toString() !== req.user.id && req.user.role !== 'admin')
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
        // Use _id.toString() to handle populated and unpopulated owner
        const ownerId = device.owner._id ? device.owner._id.toString() : device.owner.toString();
        if (ownerId !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });

        const { pins } = req.body;
        device.pins = pins;
        // Sync state map from pins
        pins.forEach(p => device.state.set(p.widgetKey, p.value));
        await device.save();
        io.emit('deviceConfigUpdate', { deviceId: device.deviceId, pins: device.pins });
        res.json(device);
    } catch (err) {
        console.error('Pin save error:', err);
        res.status(500).json({ error: 'Failed to update pins', detail: err.message });
    }
});

// Control a pin (toggle or set value)
app.post('/api/devices/:id/control', authenticate, async (req, res) => {
    try {
        const { widgetKey, value } = req.body;
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });
        const ownerId = device.owner._id ? device.owner._id.toString() : device.owner.toString();
        if (ownerId !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });

        // Update pin value in the pins array
        const pinIndex = device.pins.findIndex(p => p.widgetKey === widgetKey);
        if (pinIndex !== -1) device.pins[pinIndex].value = value;

        // Also update state map for ESP32 polling
        device.state.set(widgetKey, value);
        device.markModified('pins');
        await device.save();

        io.emit('deviceStateUpdate', { deviceId: device.deviceId, widgetKey, value, state: Object.fromEntries(device.state) });
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

        device.state.set(toggleType, state);
        const pin = device.pins.find(p => p.widgetKey === toggleType);
        if (pin) pin.value = state;
        await device.save();

        io.emit('deviceStateUpdate', { deviceId: device.deviceId, widgetKey: toggleType, value: state, state: Object.fromEntries(device.state) });
        res.json(device);
    } catch (err) {
        res.status(500).json({ error: 'Toggle failed' });
    }
});

// ─── ESP32 Auth Polling ────────────────────────────────────────────────────
// ESP32 polls this with Auth Token header
app.get('/api/esp/state', async (req, res) => {
    try {
        const token = req.headers['x-auth-token'] || req.query.token;
        if (!token) return res.status(401).json({ error: 'No auth token' });

        const device = await Device.findOne({ authToken: token });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        // Mark as online
        const wasOffline = !device.isConnected;
        device.isConnected = true;
        device.lastSeen = new Date();
        await device.save();

        if (wasOffline) {
            io.emit('deviceStatusUpdate', { deviceId: device.deviceId, isConnected: true });
        }

        // Return full readable state
        const stateObj = {};
        device.pins.forEach(pin => {
            stateObj[pin.widgetKey] = pin.value;
        });
        res.json(stateObj);
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Legacy ID-based polling (ESP32 from older firmware)
app.get('/api/esp/:id/state', async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        const wasOffline = !device.isConnected;
        device.isConnected = true;
        device.lastSeen = new Date();
        await device.save();

        if (wasOffline) {
            io.emit('deviceStatusUpdate', { deviceId: device.deviceId, isConnected: true });
        }

        res.json(Object.fromEntries(device.state));
    } catch (err) {
        res.status(500).json({ error: 'Server error' });
    }
});

// ESP32 reports sensor values back to server
app.post('/api/esp/report', async (req, res) => {
    try {
        const token = req.headers['x-auth-token'] || req.query.token;
        if (!token) return res.status(401).json({ error: 'No auth token' });

        const device = await Device.findOne({ authToken: token });
        if (!device) return res.status(404).json({ error: 'Device not found' });

        const { values } = req.body; // { widgetKey: value, ... }
        Object.entries(values).forEach(([key, val]) => {
            const pin = device.pins.find(p => p.widgetKey === key);
            if (pin && pin.mode === 'INPUT') pin.value = val;
            device.state.set(key, val);
        });
        await device.save();

        io.emit('deviceStateUpdate', { deviceId: device.deviceId, state: Object.fromEntries(device.state) });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: 'Report failed' });
    }
});

// ─── Keep-Alive & Misc ────────────────────────────────────────────────────────
app.get('/api/ping', (req, res) => {
    res.json({ status: 'active', timestamp: new Date() });
});

// ─── Offline Watchdog ─────────────────────────────────────────────────────────
setInterval(async () => {
    try {
        const timeout = new Date(Date.now() - 10000);
        const offlineDevices = await Device.find({
            isConnected: true,
            $or: [{ lastSeen: { $lt: timeout } }, { lastSeen: { $exists: false } }]
        });
        for (const dev of offlineDevices) {
            dev.isConnected = false;
            await dev.save();
            io.emit('deviceStatusUpdate', { deviceId: dev.deviceId, isConnected: false });
        }
    } catch (e) { }
}, 10000);

// ─── Socket.io ────────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
    socket.on('registerDevice', async (data) => {
        try {
            const device = await Device.findOne({ authToken: data.authToken || '' }) ||
                await Device.findOne({ deviceId: data.deviceId || '' });
            if (device) {
                device.isConnected = true;
                await device.save();
                io.emit('deviceStatusUpdate', { deviceId: device.deviceId, isConnected: true });
                socket.emit('initialState', Object.fromEntries(device.state));
            }
        } catch (err) { console.error(err); }
    });

    socket.on('disconnect', () => { });
});

// Basic health check
app.get('/', (req, res) => {
    res.send('<h1>IoIoT Platform v2.0</h1><p>Status: <span style="color: green;">Online</span></p><p>Backend is running on Hugging Face Spaces.</p>');
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`IoIoT Server running on port ${PORT}`));
