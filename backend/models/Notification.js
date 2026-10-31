const mongoose = require('mongoose');

// In-app notification for one user (alerts from automations). Kept for 30 days.
const notificationSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  deviceId: String,
  title: { type: String, required: true },
  message: String,
  level: { type: String, enum: ['info', 'warning', 'error', 'success'], default: 'warning' },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now, expires: 30 * 24 * 60 * 60 },
});

module.exports = mongoose.model('Notification', notificationSchema);
