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
        res.json({ token, role: user.role, username: user.username, userId: user._id });
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
        if (!match) return res.status(401).json({ error: 'Current password is incorrect' });
        user.password = await bcrypt.hash(newPassword, 10);
        await user.save();
        res.json({ message: 'Password changed successfully' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to change password' });
    }
});

// ─── Admin Routes ─────────────────────────────────────────────────────────────
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
    const users = await User.find({}, '-password');
    res.json(users);
});

// Admin create user directly — MUST be before /:id routes or Express matches "create" as :id
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
// Get devices: own devices + live devices for users, all for admins
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
        res.json(devices);
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
            mode: mode || 'wifi',
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

        const { name, wifiSSID, wifiPassword, mode, isLive, otaEnabled } = req.body;
        if (name !== undefined) device.name = name;
        if (wifiSSID !== undefined) device.wifiSSID = wifiSSID;
        if (wifiPassword !== undefined) device.wifiPassword = wifiPassword;
        if (mode !== undefined) device.mode = mode;
        if (otaEnabled !== undefined) device.otaEnabled = otaEnabled;
        // isLive can be updated via PUT by admin only
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
        io.emit('deviceLiveUpdate', { deviceId: device.deviceId, isLive: device.isLive });
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
        // Use _id.toString() to handle populated and unpopulated owner
        const ownerId = (device.owner?._id || device.owner)?.toString();
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
        const ownerIdCtrl = (device.owner?._id || device.owner)?.toString();
        if (ownerIdCtrl !== req.user.id && req.user.role !== 'admin')
            return res.status(403).json({ error: 'Unauthorized' });

        // Update pin value in the pins array
        const pinIndex = device.pins.findIndex(p => p.widgetKey === widgetKey);
        if (pinIndex !== -1) device.pins[pinIndex].value = value;

        // Also update state map for ESP32 polling
        device.state.set(widgetKey, value);
        device.markModified('pins');
        // Instantly notify via socket before waiting for DB save
        io.emit('deviceStateUpdate', {
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

        device.state.set(toggleType, state);
        const pin = device.pins.find(p => p.widgetKey === toggleType);
        if (pin) pin.value = state;
        // Instantly notify via socket
        io.emit('deviceStateUpdate', {
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

        // Add OTA info if available
        if (device.otaEnabled && device.latestFirmware) {
            stateObj._ota = {
                url: `${req.protocol}://${req.get('host')}/api/esp/ota/${device.deviceId}`,
                ver: device.latestFirmware.version
            };
        }

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

    // --- INSTANT CONTROL VIA SOCKETS ---
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
            const ownerId = (device.owner?._id || device.owner)?.toString();
            if (ownerId !== user._id.toString() && user.role !== 'admin') return;

            // Update pin value
            const pinIndex = device.pins.findIndex(p => p.widgetKey === widgetKey);
            if (pinIndex !== -1) device.pins[pinIndex].value = value;

            device.state.set(widgetKey, value);
            device.markModified('pins');

            // Instantly emit to all other clients (including the sender for confirmation if needed)
            io.emit('deviceStateUpdate', {
                deviceId,
                widgetKey,
                value,
                state: Object.fromEntries(device.state)
            });

            // Save to DB in background
            await device.save();
        } catch (err) {
            console.error('Socket control error:', err);
        }
    });

    socket.on('disconnect', () => { });
});

// Basic health check
app.get('/', (req, res) => {
    res.send('<h1>IoIoT Platform v2.0</h1><p>Status: <span style="color: green;">Online</span></p><p>Backend is running on Hugging Face Spaces.</p>');
});

// ─── ESP32 Compile Endpoint ──────────────────────────────────────────────────
// Compiles Arduino sketch using arduino-cli and streams logs back as SSE.
// Returns the compiled binary files as base64 for browser-side flashing via esptool-js.
app.post('/api/compile', authenticate, async (req, res) => {
    const { code, board = 'esp32:esp32:esp32' } = req.body;
    if (!code || !code.trim()) {
        return res.status(400).json({ error: 'No code provided' });
    }

    // Check arduino-cli is available
    const checkCli = spawn('which', ['arduino-cli']);
    const cliAvailable = await new Promise(r => checkCli.on('close', c => r(c === 0)));
    if (!cliAvailable) {
        return res.status(503).json({ error: 'Compilation service not available. arduino-cli is not installed on this server.' });
    }

    // Set SSE headers for streaming logs
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.flushHeaders();

    const sse = (type, data) => {
        try { res.write(`data: ${JSON.stringify({ type, data })}\n\n`); } catch { }
    };

    // Create temp sketch directory
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
            // Filter out noise, only show meaningful errors
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

            // Find boot_app0.bin from the ESP32 core installation
            let bootApp0Data = null;
            try {
                const bootApp0Path = fs.readFileSync('/boot_app0_path.txt', 'utf8').trim();
                if (bootApp0Path && fs.existsSync(bootApp0Path)) {
                    bootApp0Data = fs.readFileSync(bootApp0Path).toString('base64');
                }
            } catch { }

            const flashFiles = [];
            if (bootloaderName) flashFiles.push({ address: 0x1000, data: readBin(bootloaderName), name: 'Bootloader' });
            if (partitionsName) flashFiles.push({ address: 0x8000, data: readBin(partitionsName), name: 'Partition Table' });
            if (bootApp0Data) flashFiles.push({ address: 0xe000, data: bootApp0Data, name: 'Boot App0' });
            flashFiles.push({ address: 0x10000, data: readBin(sketchBinName), name: 'Sketch' });

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

    // If client disconnects, kill the child process
    req.on('close', () => {
        try { child.kill('SIGTERM'); } catch { }
    });
});

// ─── OTA Firmware Storage ────────────────────────────────────────────────────
// In a real prod environment, use S3. For this space, we'll store in a local 'firmware' folder.
const firmwareDir = path.join(__dirname, 'firmware');
if (!fs.existsSync(firmwareDir)) fs.mkdirSync(firmwareDir);

app.post('/api/devices/:id/firmware', authenticate, async (req, res) => {
    try {
        const { binary, version } = req.body; // binary is base64
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

app.get('/api/esp/ota/:id', async (req, res) => {
    try {
        const device = await Device.findOne({ deviceId: req.params.id });
        if (!device || !device.latestFirmware) return res.status(404).send('No firmware');

        // Simple security: check token in query if needed, but for now we rely on the unique deviceId
        res.sendFile(device.latestFirmware.filePath);
    } catch (err) {
        res.status(500).send('Server error');
    }
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`IoIoT Server running on port ${PORT}`));
