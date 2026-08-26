const express = require('express');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const normalizePayload = (body = {}) => {
  const price = Number(body.price ?? body.productPrice ?? 0);
  const discount = Number(body.discount ?? body.productDiscount ?? 0);
  const category = body.category || body.productCategory || body.productNewCategory;
  const images = body.images || body.carousel || body.productCarousel || [];
  const sizes = body.sizes || body.productSizes || [];
  const name = body.name || body.title || body.productName;
  const image = body.image || body.mainImg || body.productMainImg || '';
  const originalPrice = Number(body.originalPrice || (discount > 0 ? price / (1 - discount / 100) : price));

  return {
    name,
    title: undefined,
    description: body.description ?? body.productDescription ?? '',
    category,
    brand: body.brand || '',
    gender: body.gender || body.productGender || 'Unisex',
    price,
    originalPrice,
    discount: Math.max(0, Math.min(100, discount)),
    image,
    images: Array.isArray(images) ? images.filter(Boolean) : [],
    sizes: Array.isArray(sizes) ? sizes.map(String) : [],
    colors: Array.isArray(body.colors) ? body.colors.map(String) : [],
    stock: Number(body.stock ?? 0),
    rating: Number(body.rating ?? 0),
    numReviews: Number(body.numReviews ?? 0),
    active: body.active !== false
  };
};

router.get('/', async (req, res, next) => {
  try {
    const { category, search, brand, minPrice, maxPrice, active } = req.query;
    const filter = {};
    if (active !== 'false') filter.active = true;
    if (category) filter.category = new RegExp(`^${escapeRegex(category)}$`, 'i');
    if (brand) filter.brand = new RegExp(`^${escapeRegex(brand)}$`, 'i');
    if (search) {
      const safeSearch = escapeRegex(search);
      filter.$or = [
        { name: new RegExp(safeSearch, 'i') },
        { description: new RegExp(safeSearch, 'i') },
        { brand: new RegExp(safeSearch, 'i') }
      ];
    }
    if (minPrice || maxPrice) filter.price = { ...(minPrice ? { $gte: Number(minPrice) } : {}), ...(maxPrice ? { $lte: Number(maxPrice) } : {}) };
    const products = await Product.find(filter).sort({ createdAt: -1 });
    res.json({ products });
  } catch (error) { next(error); }
});

router.get('/categories', async (_req, res, next) => {
  try { res.json({ categories: await Product.distinct('category', { active: true }) }); } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
  } catch (error) { next(error); }
});

router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const payload = normalizePayload(req.body);
    if (!payload.name || !payload.category || !Number.isFinite(payload.price) || payload.price < 0) {
      return res.status(400).json({ message: 'Name, category and a valid price are required' });
    }
    res.status(201).json({ product: await Product.create(payload) });
  } catch (error) { next(error); }
});

router.put('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const payload = normalizePayload(req.body);
    const product = await Product.findByIdAndUpdate(req.params.id, payload, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ product });
  } catch (error) { next(error); }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    res.json({ message: 'Product deleted' });
  } catch (error) { next(error); }
});

module.exports = router;
