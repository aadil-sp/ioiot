const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, trim: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin', 'shopkeeper'], default: 'user' },
  isApproved: { type: Boolean, default: false },
  walletBalance: { type: Number, default: 0 },
  shopName: { type: String, trim: true } // Only used if role is 'shopkeeper'
});

module.exports = mongoose.model('User', userSchema);
