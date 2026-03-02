const mongoose = require('mongoose');
const crypto = require('crypto');

const pinSchema = new mongoose.Schema({
    pinNumber: { type: Number, required: true },
    label: { type: String, required: true, default: 'New Pin' },
    mode: { type: String, enum: ['OUTPUT', 'INPUT', 'INPUT_PULLUP'], default: 'OUTPUT' },
    type: { type: String, enum: ['digital', 'pwm', 'analog_input'], default: 'digital' },
    widgetType: { type: String, enum: ['toggle', 'slider', 'button', 'value_display'], default: 'toggle' },
    widgetKey: { type: String, required: true },
    value: { type: mongoose.Schema.Types.Mixed, default: false }, // bool for digital, 0-255 for pwm
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
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    pins: [pinSchema],
    // Legacy fields kept for backward compatibility
    state: { type: Map, of: mongoose.Schema.Types.Mixed, default: {} },
    controls: { type: Array, default: [] },
    isConnected: { type: Boolean, default: false },
    lastSeen: { type: Date },
}, { timestamps: true });

module.exports = mongoose.model('Device', deviceSchema);
