const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    state: {
        ledG: { type: Boolean, default: false },
        ledB: { type: Boolean, default: false },
        ledR: { type: Boolean, default: false },
        flash: { type: Boolean, default: false },
        propeller: { type: Boolean, default: false }
    },
    isConnected: { type: Boolean, default: false }
});

module.exports = mongoose.model('Device', deviceSchema);
