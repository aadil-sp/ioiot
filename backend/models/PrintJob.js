const mongoose = require('mongoose');

const printJobSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  guestCode: { type: String, trim: true }, // For loginless users
  shopId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  
  fileUrl: { type: String, required: true }, // Usually base64 string or an S3/Cloudinary link
  fileName: { type: String, required: true },
  
  options: {
    color: { type: Boolean, default: false },
    copies: { type: Number, default: 1 },
    doubleSided: { type: Boolean, default: false },
    pages: { type: Number, default: 1 } // To calculate price if needed
  },
  
  status: { type: String, enum: ['pending', 'approved', 'printing', 'completed', 'terminated'], default: 'pending' },
  
  price: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

printJobSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('PrintJob', printJobSchema);
