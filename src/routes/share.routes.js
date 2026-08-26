const express = require('express');
const Share = require('../models/Share');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/', async (req, res, next) => {
  try {
    const product = await Product.findById(req.body.productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const share = await Share.create({ product: product._id, sharedBy: req.user._id, sharedTo: req.body.sharedTo || '' });
    res.status(201).json({ share });
  } catch (error) { next(error); }
});

router.get('/', adminOnly, async (_req, res, next) => {
  try {
    const shares = await Share.find().populate('product', 'name image').populate('sharedBy', 'name email').sort({ createdAt: -1 });
    res.json({ shares });
  } catch (error) { next(error); }
});

module.exports = router;
