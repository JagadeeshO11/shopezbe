const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/', async (req, res, next) => {
  try { const user = await User.findById(req.user._id).populate('wishlist'); res.json({ wishlist: user.wishlist || [] }); } catch (error) { next(error); }
});

router.post('/:productId', async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });
    const user = await User.findById(req.user._id);
    if (!user.wishlist.some(id => id.toString() === product._id.toString())) user.wishlist.push(product._id);
    await user.save();
    await user.populate('wishlist');
    res.status(201).json({ wishlist: user.wishlist });
  } catch (error) { next(error); }
});

router.delete('/:productId', async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    user.wishlist = user.wishlist.filter(id => id.toString() !== req.params.productId);
    await user.save();
    await user.populate('wishlist');
    res.json({ wishlist: user.wishlist });
  } catch (error) { next(error); }
});

module.exports = router;
