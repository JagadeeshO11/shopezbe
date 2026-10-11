const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  refreshTokenHash: { type: String, required: true, select: false },
  deviceName: { type: String, default: 'Web browser', trim: true, maxlength: 100 },
  userAgent: { type: String, default: '' },
  ipAddress: { type: String, default: '' },
  lastUsedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  revokedAt: { type: Date, default: null, index: true }
}, { timestamps: true });

sessionSchema.index({ user: 1, revokedAt: 1, expiresAt: 1 });

module.exports = mongoose.model('Session', sessionSchema);
