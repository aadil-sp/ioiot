const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    deviceId: { type: String, required: true, unique: true },
    state: { type: Map, of: Boolean, default: {} },
    controls: [
        {
            key: { type: String, required: true },
            label: { type: String, required: true },
            type: { type: String, enum: ['toggle', 'momentary'], default: 'toggle' },
            icon: { type: String, default: 'Zap' },
            activeColor: { type: String, default: 'shadow-[0_0_20px_#f9731699]' },
            handleColor: { type: String, default: 'bg-orange-500' },
            category: { type: String, enum: ['logic', 'heavy'], default: 'logic' }
        }
    ],
    isConnected: { type: Boolean, default: false }
});

module.exports = mongoose.model('Device', deviceSchema);
