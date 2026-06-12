const mongoose = require('mongoose');
const crypto = require('crypto');

const pinSchema = new mongoose.Schema({
    pinNumber: { type: Number, required: true },
    label: { type: String, required: true, default: 'New Pin' },
    mode: { type: String, enum: ['OUTPUT', 'INPUT', 'INPUT_PULLUP'], default: 'OUTPUT' },
    type: { type: String, enum: ['digital', 'pwm', 'analog_input', 'servo'], default: 'digital' },
    widgetType: { type: String, enum: ['toggle', 'slider', 'button', 'value_display', 'servo_slider'], default: 'toggle' },
    widgetKey: { type: String, required: true },
    hardwareType: { type: String, default: '' },
    commandChar: { type: String, default: '' },
    value: { type: mongoose.Schema.Types.Mixed, default: false },
    min: { type: Number, default: 0 },
    max: { type: Number, default: 255 },
    color: { type: String, default: '#f97316' },
    widgetSize: { type: String, enum: ['sm', 'md', 'lg', 'full'], default: 'md' },
});

// A single step within a custom action sequence
const actionStepSchema = new mongoose.Schema({
    pins: [{ type: String }],          // widgetKeys of pins to fire
    value: { type: mongoose.Schema.Types.Mixed, default: true }, // true/false for digital, 0-255 for PWM
    delay: { type: Number, default: 150 },  // ms to wait after this step before next step
    pulse: { type: Boolean, default: false }, // if true: fire ON then auto-OFF after pulseMs
    pulseMs: { type: Number, default: 200 }, // duration of pulse
}, { _id: false });

// A full custom action (macro) with ON and OFF sequences
const actionSchema = new mongoose.Schema({
    id: { type: String, default: () => crypto.randomBytes(6).toString('hex') },
    name: { type: String, default: 'New Action' },
    icon: { type: String, default: '⚡' },
    color: { type: String, default: '#f97316' },
    onSequence: [actionStepSchema],
    offSequence: [actionStepSchema],
    widgetSize: { type: String, enum: ['sm', 'md', 'lg', 'full'], default: 'lg' },
}, { _id: false });

const deviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    name: { type: String, default: 'My Device' },
    authToken: {
        type: String,
        default: () => crypto.randomBytes(16).toString('hex'),
        unique: true
    },
    board: { type: String, default: 'esp32' },
    mode: { type: String, default: 'wifi' },
    otaEnabled: { type: Boolean, default: false },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pins: [pinSchema],
    customActions: [actionSchema],
    wifiSSID: { type: String, default: '' },
    wifiPassword: { type: String, default: '' },
    latestFirmware: {
        version: String,
        filePath: String,
        uploadedAt: Date
    },
    state: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    controls: { type: Array, default: [] },
    isConnected: { type: Boolean, default: false },
    lastSeen: { type: Date },
    isLive: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('Device', deviceSchema);
