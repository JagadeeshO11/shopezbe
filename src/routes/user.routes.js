const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

router.get('/me', protect, async (req, res) => res.json({ user: req.user }));

router.patch('/me', protect, async (req, res, next) => {
  try {
    const allowed = ['name', 'phone', 'address'];
    const updates = {};
    allowed.forEach(key => { if (req.body[key] !== undefined) updates[key] = req.body[key]; });
    if (req.body.password) updates.password = await bcrypt.hash(req.body.password, 12);
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select('-password');
    res.json({ user });
  } catch (error) { next(error); }
});

router.get('/', protect, adminOnly, async (_req, res, next) => {
  try { res.json({ users: await User.find().select('-password').sort({ createdAt: -1 }) }); } catch (error) { next(error); }
});

router.patch('/:id/role', protect, adminOnly, async (req, res, next) => {
  try {
    if (!['customer', 'admin'].includes(req.body.role)) return res.status(400).json({ message: 'Invalid role' });
    const user = await User.findByIdAndUpdate(req.params.id, { role: req.body.role }, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ user });
  } catch (error) { next(error); }
});

router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (req.params.id === req.user._id.toString()) return res.status(400).json({ message: 'You cannot delete your own admin account' });
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'User deleted' });
  } catch (error) { next(error); }
});

module.exports = router;
