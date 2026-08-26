const mongoose = require('mongoose');

const shareSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  sharedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  sharedTo: { type: String, default: '' }
}, { timestamps: true });

module.exports = mongoose.model('Share', shareSchema);
