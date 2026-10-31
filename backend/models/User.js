const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'shopkeeper'], default: 'user' },
  isApproved: { type: Boolean, default: false },
  isGuest: { type: Boolean, default: false }, // one-time account, deleted when the session ends
  walletBalance: { type: Number, default: 0 },
  shopName: { type: String, trim: true }, // Only used if role is 'shopkeeper'
  profile: {
    displayName: { type: String, trim: true, maxlength: 50, default: '' },
    bio: { type: String, trim: true, maxlength: 300, default: '' },
    avatarColor: { type: String, default: '#f97316' },
    betaMode: { type: Boolean, default: false },
    notifications: { type: Boolean, default: true },
  },
  // Usage tracking (accounts created before this have no createdAt; the admin
  // API falls back to the ObjectId timestamp for those)
  lastLoginAt: { type: Date },
  lastSeenAt: { type: Date },
  loginCount: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
