const mongoose = require('mongoose');

const otpChallengeSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  codeHash: { type: String, required: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  attempts: { type: Number, default: 0, min: 0 },
  sends: { type: Number, default: 1, min: 0 },
  lastSentAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('OtpChallenge', otpChallengeSchema);
