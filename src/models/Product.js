const mongoose = require('mongoose');

const productSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  category: { type: String, required: true, trim: true },
  brand: { type: String, default: '' },
  gender: { type: String, enum: ['Men', 'Women', 'Unisex', ''], default: 'Unisex' },
  price: { type: Number, required: true, min: 0 },
  originalPrice: { type: Number, default: 0, min: 0 },
  discount: { type: Number, default: 0, min: 0, max: 100 },
  image: { type: String, default: '' },
  images: [{ type: String }],
  sizes: [{ type: String }],
  colors: [{ type: String }],
  stock: { type: Number, default: 0, min: 0 },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  numReviews: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true }
}, { timestamps: true });

// Keep the sale price and original price consistent when an admin supplies a discount.
productSchema.pre('validate', function(next) {
  if (this.price == null) return next();
  if (!this.originalPrice || this.originalPrice < this.price) this.originalPrice = this.price;
  if (this.discount > 0) {
    this.originalPrice = Math.max(this.originalPrice, this.price / (1 - this.discount / 100));
  }
  next();
});

module.exports = mongoose.model('Product', productSchema);
