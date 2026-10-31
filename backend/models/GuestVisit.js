const mongoose = require('mongoose');

// One row per guest session. The guest's account and devices are deleted when
// the session ends; this record stays so admins can see who visited and for how long.
const guestVisitSchema = new mongoose.Schema({
  name: { type: String, required: true },
  user: { type: mongoose.Schema.Types.ObjectId },
  device: { type: String, default: 'Desktop' }, // 'Mobile' | 'Desktop'
  startedAt: { type: Date, default: Date.now },
  lastSeenAt: { type: Date, default: Date.now },
  endedAt: { type: Date },
  endReason: { type: String, enum: ['closed', 'logout', 'timeout'] },
  devicesCreated: { type: Number, default: 0 },
});

module.exports = mongoose.model('GuestVisit', guestVisitSchema);
