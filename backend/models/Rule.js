const mongoose = require('mongoose');

// An automation on one device: when the trigger happens, run the actions.
//   value    — a pin's value crosses a threshold (optionally held for N seconds)
//   offline  — the device has been offline for N minutes
//   online   — the device came back online
//   schedule — at a time of day on chosen weekdays, in the owner's time zone
const ruleSchema = new mongoose.Schema({
  deviceId: { type: String, required: true, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, trim: true, maxlength: 60, default: 'New automation' },
  enabled: { type: Boolean, default: true },
  trigger: {
    type: { type: String, enum: ['value', 'offline', 'online', 'schedule'], required: true },
    key: String,
    op: { type: String, enum: ['>', '<', '>=', '<=', '==', '!='] },
    value: Number,
    forSeconds: { type: Number, default: 0, min: 0, max: 86400 },
    forMinutes: { type: Number, default: 5, min: 1, max: 1440 },
    time: String, // 'HH:MM'
    days: { type: [Number], default: [0, 1, 2, 3, 4, 5, 6] },
    timeZone: { type: String, default: 'UTC' },
  },
  actions: [{
    _id: false,
    type: { type: String, enum: ['notify', 'set'], required: true },
    message: { type: String, maxlength: 200 },
    key: String,
    value: mongoose.Schema.Types.Mixed,
  }],
  cooldownMinutes: { type: Number, default: 5, min: 0, max: 1440 },
  // Engine state
  conditionSince: Date,
  active: { type: Boolean, default: false },
  lastFiredAt: Date,
  lastScheduleKey: String,
}, { timestamps: true });

module.exports = mongoose.model('Rule', ruleSchema);
