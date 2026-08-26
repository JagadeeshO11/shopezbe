const express = require('express');
const User = require('../models/User');
const Product = require('../models/Product');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.get('/all', adminOnly, async (_req, res, next) => {
  try {
    const users = await User.find({ role: 'customer' }).select('name email wishlist').populate('wishlist');
    const wishlists = [];
    users.forEach(user => (user.wishlist || []).forEach(product => {
      if (product) wishlists.push({ ...product.toObject(), userId: user._id, username: user.name, email: user.email });
    }));
    res.json({ wishlists });
  } catch (error) { next(error); }
});

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
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.wishlist = user.wishlist.filter(id => id.toString() !== req.params.productId);
    await user.save();
    await user.populate('wishlist');
    res.json({ wishlist: user.wishlist });
  } catch (error) { next(error); }
});

module.exports = router;
