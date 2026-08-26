const express = require('express');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { category, search, brand, minPrice, maxPrice, active } = req.query;
    const filter = {};
    if (active !== 'false') filter.active = true;
    if (category) filter.category = new RegExp(`^${category}$`, 'i');
    if (brand) filter.brand = new RegExp(`^${brand}$`, 'i');
    if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { description: new RegExp(search, 'i') }, { brand: new RegExp(search, 'i') }];
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
  try { res.status(201).json({ product: await Product.create(req.body) }); } catch (error) { next(error); }
});

router.put('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
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
