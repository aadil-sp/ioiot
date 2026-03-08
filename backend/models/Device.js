const mongoose = require('mongoose');
const crypto = require('crypto');

const pinSchema = new mongoose.Schema({
    pinNumber: { type: Number, required: true },
    label: { type: String, required: true, default: 'New Pin' },
    mode: { type: String, enum: ['OUTPUT', 'INPUT', 'INPUT_PULLUP'], default: 'OUTPUT' },
    type: { type: String, enum: ['digital', 'pwm', 'analog_input', 'servo'], default: 'digital' },
    widgetType: { type: String, enum: ['toggle', 'slider', 'button', 'value_display', 'servo_slider'], default: 'toggle' },
    widgetKey: { type: String, required: true },
    hardwareType: { type: String, default: '' }, // e.g. 'led', 'servo', 'relay', etc.
    commandChar: { type: String, default: '' }, // Single char the ESP listens for e.g. 'G'
    value: { type: mongoose.Schema.Types.Mixed, default: false },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 255 },
    color: { type: String, default: '#f97316' },
});

const deviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    name: { type: String, default: 'My Device' },
    authToken: {
        type: String,
        default: () => crypto.randomBytes(16).toString('hex'),
        unique: true
    },
    // board: which physical board this is (no enum — flexible for new boards)
    board: { type: String, default: 'esp32' },
    // Device mode: 'wifi'=cloud poll, 'serial'=Bluetooth chars, 'usb'=direct USB serial (Arduino)
    mode: { type: String, default: 'wifi' },
    otaEnabled: { type: Boolean, default: false },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pins: [pinSchema],
    // WiFi credentials stored per-device for code generation
    wifiSSID: { type: String, default: '' },
    wifiPassword: { type: String, default: '' },
    // Latest firmware for OTA
    latestFirmware: {
        version: String,
        filePath: String,
        uploadedAt: Date
    },
    // Legacy fields kept for backward compatibility
    state: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    controls: { type: Array, default: [] },
    isConnected: { type: Boolean, default: false },
    lastSeen: { type: Date },
    isLive: { type: Boolean, default: false }, // When true, visible to all users on UserDashboard
}, { timestamps: true });

module.exports = mongoose.model('Device', deviceSchema);
