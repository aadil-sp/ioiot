const mongoose = require('mongoose');

// Pin history, bucketed: one document per device per hour holding up to ~120
// samples (one every 30s). Buckets expire after 30 days to keep storage small.
const readingSchema = new mongoose.Schema({
  deviceId: { type: String, required: true },
  hour: { type: Date, required: true },
  samples: [{
    _id: false,
    t: Date,
    v: { type: Map, of: Number }, // widgetKey -> value (booleans stored as 1/0)
  }],
});

readingSchema.index({ deviceId: 1, hour: 1 }, { unique: true });
readingSchema.index({ hour: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });

module.exports = mongoose.model('Reading', readingSchema);
