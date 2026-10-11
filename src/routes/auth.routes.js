const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { protect } = require('../middleware/auth');

const router = express.Router();

function tokenFor(user) {
  return jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, address } = req.body;
    if (!name || !String(email || '').trim() || !password) return res.status(400).json({ message: 'Name, email and password are required' });
    if (String(name).trim().length < 2 || String(name).trim().length > 80) return res.status(400).json({ message: 'Name must be between 2 and 80 characters' });
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(String(email).trim())) return res.status(400).json({ message: 'Enter a valid email address' });
    if (phone && !/^[+0-9()\\-\\s]{7,20}$/.test(String(phone))) return res.status(400).json({ message: 'Enter a valid phone number' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ message: 'Password must be between 8 and 128 characters' });
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Email is already registered' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name, email: email.toLowerCase(), password: passwordHash, phone, address });
    res.status(201).json({ token: tokenFor(user), user: { id: user._id, name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role } });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!String(email || '').trim() || typeof password !== 'string') return res.status(400).json({ message: 'Email and password are required' });
    const user = await User.findOne({ email: String(email).trim().toLowerCase() });
    if (!user || !(await bcrypt.compare(password || '', user.password))) return res.status(401).json({ message: 'Invalid email or password' });
    res.json({ token: tokenFor(user), user: { id: user._id, name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role } });
  } catch (error) { next(error); }
});

router.get('/me', protect, (req, res) => res.json({ user: req.user }));

module.exports = router;
