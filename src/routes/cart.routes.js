const express = require('express');
const Cart = require('../models/Cart');
const Product = require('../models/Product');
const { protect } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

async function getCart(userId) {
  let cart = await Cart.findOne({ user: userId }).populate('items.product');
  if (!cart) cart = await Cart.create({ user: userId, items: [] });
  return cart;
}

router.get('/', async (req, res, next) => {
  try { res.json({ cart: await getCart(req.user._id) }); } catch (error) { next(error); }
});

router.post('/items', async (req, res, next) => {
  try {
    const { productId, quantity = 1, size, color } = req.body;
    const product = await Product.findById(productId);
    if (!product || !product.active) return res.status(404).json({ message: 'Product not found' });
    const cart = await Cart.findOne({ user: req.user._id }) || await Cart.create({ user: req.user._id, items: [] });
    const item = cart.items.find(i => i.product.toString() === productId && String(i.size || '') === String(size || '') && String(i.color || '') === String(color || ''));
    if (item) item.quantity += Number(quantity);
    else cart.items.push({ product: productId, quantity: Number(quantity), size, color });
    await cart.save();
    res.status(201).json({ cart: await cart.populate('items.product') });
  } catch (error) { next(error); }
});

router.patch('/items/:itemId', async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    const item = cart?.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Cart item not found' });
    item.quantity = Number(req.body.quantity);
    if (!Number.isInteger(item.quantity) || item.quantity < 1) return res.status(400).json({ message: 'Quantity must be at least 1' });
    await cart.save();
    res.json({ cart: await cart.populate('items.product') });
  } catch (error) { next(error); }
});

router.delete('/items/:itemId', async (req, res, next) => {
  try {
    const cart = await Cart.findOne({ user: req.user._id });
    if (!cart) return res.json({ cart: { items: [] } });
    const item = cart.items.id(req.params.itemId);
    if (!item) return res.status(404).json({ message: 'Cart item not found' });
    item.deleteOne();
    await cart.save();
    res.json({ cart: await cart.populate('items.product') });
  } catch (error) { next(error); }
});

router.delete('/', async (req, res, next) => {
  try { await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] }, { upsert: true }); res.json({ message: 'Cart cleared', cart: { items: [] } }); } catch (error) { next(error); }
});

module.exports = router;
