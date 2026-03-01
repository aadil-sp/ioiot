require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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

// Connect to MongoDB
mongoose.connect(MONGO_URI).then(async () => {
    console.log('MongoDB connected');
    // Seed initial Admin and user
    const adminExists = await User.findOne({ username: 'admin' });
    if (!adminExists) {
        const hashedAdmin = await bcrypt.hash('admin@123', 10);
        await User.create({ username: 'admin', password: hashedAdmin, role: 'admin', isApproved: true });
        console.log('Admin user seeded');
    }

    const userExists = await User.findOne({ username: 'abhiram' });
    if (!userExists) {
        const hashedUser = await bcrypt.hash('abhiram@123', 10);
        await User.create({ username: 'abhiram', password: hashedUser, role: 'user', isApproved: true });
        console.log('Test user abhiram seeded');
    }

    // Seed default device
    const deviceExists = await Device.findOne({ deviceId: 'device-001' });
    if (!deviceExists) {
        await Device.create({ deviceId: 'device-001' });
        console.log('Test device seeded');
    }
}).catch(err => console.error('MongoDB connection error', err));

// Auth Routes
app.post('/api/auth/register', async (req, res) => {
    try {
        const { username, password } = req.body;
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
        const { username, password } = req.body;
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

// Admin routes
app.get('/api/admin/users', authenticate, requireAdmin, async (req, res) => {
    const users = await User.find({ role: 'user' }, '-password');
    res.json(users);
});

app.post('/api/admin/users/:id/approve', authenticate, requireAdmin, async (req, res) => {
    await User.findByIdAndUpdate(req.params.id, { isApproved: true });
    res.json({ message: 'User approved' });
});

// Device API
app.get('/api/devices', authenticate, async (req, res) => {
    const devices = await Device.find();
    res.json(devices);
});

app.post('/api/devices/:id/toggle', authenticate, async (req, res) => {
    const { toggleType, state } = req.body; // toggleType: ledG, ledB, ledR, flash, propeller
    const device = await Device.findOne({ deviceId: req.params.id });
    if (!device) return res.status(404).json({ error: 'Device not found' });

    device.state[toggleType] = state;
    await device.save();

    // Notify connected clients (React and ESP)
    io.emit('deviceStateUpdate', { deviceId: device.deviceId, state: device.state });
    res.json(device);
});

// Socket.io for Real-time ESP & Client connections

// ESP32 Simple Polling endpoint
app.get('/api/esp/:id/state', async (req, res) => {
    const device = await Device.findOne({ deviceId: req.params.id });
    if (device) {
        res.json(device.state);
    } else {
        res.status(404).json({ error: 'Device not found' });
    }
});

io.on('connection', (socket) => {
    console.log('New client connected', socket.id);

    socket.on('registerDevice', async (data) => {
        console.log('Device connected:', data.deviceId);
        socket.join('devices');
        try {
            const device = await Device.findOne({ deviceId: data.deviceId });
            if (device) {
                device.isConnected = true;
                await device.save();
                io.emit('deviceStatusUpdate', { deviceId: data.deviceId, isConnected: true });
                // Send initial state to ESP
                socket.emit('initialState', device.state);
            }
        } catch (err) { console.error(err) }
    });

    socket.on('disconnect', async () => {
        // Ideally map socket to deviceId to mark as disconnected
        console.log('Client disconnected', socket.id);
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
