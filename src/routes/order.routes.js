const express = require('express');
const Order = require('../models/Order');
const Product = require('../models/Product');
const Cart = require('../models/Cart');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();
router.use(protect);

router.post('/', async (req, res, next) => {
  try {
    const { items, shippingAddress = {}, paymentMethod = 'COD', shippingFee = 0 } = req.body;
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ message: 'Order items are required' });

    const ids = items.map(i => i.product);
    const products = await Product.find({ _id: { $in: ids }, active: true });
    const byId = new Map(products.map(p => [p._id.toString(), p]));
    const normalized = items.map(i => {
      const p = byId.get(String(i.product));
      if (!p) throw Object.assign(new Error('One or more products are unavailable'), { status: 400 });
      const quantity = Number(i.quantity);
      if (!Number.isInteger(quantity) || quantity < 1) throw Object.assign(new Error(`Invalid quantity for ${p.name}`), { status: 400 });
      if (quantity > p.stock) throw Object.assign(new Error(`${p.name} has only ${p.stock} item(s) left`), { status: 400 });
      return { product: p._id, name: p.name, image: p.image, price: p.price, quantity, size: i.size, color: i.color };
    });

    const subtotal = normalized.reduce((sum, i) => sum + i.price * i.quantity, 0);
    const safeShippingFee = Math.max(0, Number(shippingFee || 0));
    const total = subtotal + safeShippingFee;
    const address = {
      name: shippingAddress.name || req.user.name,
      email: shippingAddress.email || req.user.email,
      phone: shippingAddress.phone || shippingAddress.mobile || req.user.phone || '',
      mobile: shippingAddress.mobile || shippingAddress.phone || req.user.phone || '',
      address: shippingAddress.address || '',
      city: shippingAddress.city || '',
      state: shippingAddress.state || '',
      postalCode: shippingAddress.postalCode || shippingAddress.pincode || '',
      pincode: shippingAddress.pincode || shippingAddress.postalCode || ''
    };

    const order = await Order.create({
      user: req.user._id,
      items: normalized,
      shippingAddress: address,
      paymentMethod: paymentMethod || 'COD',
      subtotal,
      shippingFee: safeShippingFee,
      total
    });

    await Promise.all(normalized.map(i => Product.findByIdAndUpdate(i.product, { $inc: { stock: -i.quantity } })));
    await Cart.findOneAndUpdate({ user: req.user._id }, { items: [] });
    res.status(201).json({ order });
  } catch (error) { next(error); }
});

router.get('/mine', async (req, res, next) => {
  try { res.json({ orders: await Order.find({ user: req.user._id }).populate('items.product').sort({ createdAt: -1 }) }); } catch (error) { next(error); }
});

router.get('/', adminOnly, async (_req, res, next) => {
  try { res.json({ orders: await Order.find().populate('user', 'name email phone').populate('items.product').sort({ createdAt: -1 }) }); } catch (error) { next(error); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const order = await Order.findById(req.params.id).populate('items.product').populate('user', 'name email phone');
    if (!order) return res.status(404).json({ message: 'Order not found' });
    if (req.user.role !== 'admin' && (!order.user || order.user._id.toString() !== req.user._id.toString())) return res.status(403).json({ message: 'Access denied' });
    res.json({ order });
  } catch (error) { next(error); }
});

router.patch('/:id/status', adminOnly, async (req, res, next) => {
  try {
    const allowed = ['pending', 'confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!allowed.includes(req.body.status)) return res.status(400).json({ message: 'Invalid order status' });
    const order = await Order.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
    if (!order) return res.status(404).json({ message: 'Order not found' });
    res.json({ order });
  } catch (error) { next(error); }
});

module.exports = router;
