const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Session = require('../models/Session');
const { protect } = require('../middleware/auth');

const router = express.Router();
const ACCESS_TTL = process.env.ACCESS_TOKEN_TTL || '15m';
const REFRESH_DAYS = Math.max(1, Number(process.env.REFRESH_TOKEN_DAYS || 30));
const REFRESH_COOKIE = 'shopez_refresh';

function cookieOptions() {
  const secure = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  return {
    httpOnly: true,
    secure,
    sameSite: secure ? 'none' : 'lax',
    path: '/api/v1/auth',
    maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000
  };
}

function readCookie(req, name) {
  const raw = req.headers.cookie || '';
  const pair = raw.split(';').map(v => v.trim()).find(v => v.startsWith(name + '='));
  return pair ? decodeURIComponent(pair.slice(name.length + 1)) : '';
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function createAccessToken(user, sessionId) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  return jwt.sign({ id: String(user._id), role: user.role, sid: String(sessionId) }, process.env.JWT_SECRET, { expiresIn: ACCESS_TTL });
}

function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, phone: user.phone, address: user.address, role: user.role };
}

function deviceName(req) {
  const supplied = String(req.body?.deviceName || '').trim().slice(0, 100);
  if (supplied) return supplied;
  const ua = req.headers['user-agent'] || '';
  if (/android/i.test(ua)) return 'Android browser';
  if (/iphone|ipad/i.test(ua)) return 'iPhone/iPad browser';
  if (/windows/i.test(ua)) return 'Windows browser';
  if (/macintosh|mac os/i.test(ua)) return 'Mac browser';
  return 'Web browser';
}

async function startSession(req, res, user) {
  const refreshToken = crypto.randomBytes(48).toString('hex');
  const session = await Session.create({
    user: user._id,
    refreshTokenHash: tokenHash(refreshToken),
    deviceName: deviceName(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 500),
    ipAddress: String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().slice(0, 100),
    expiresAt: new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000)
  });
  res.cookie(REFRESH_COOKIE, refreshToken, cookieOptions());
  return { accessToken: createAccessToken(user, session._id), sessionId: String(session._id) };
}

router.post('/register', async (req, res, next) => {
  try {
    const { name, email, password, phone, address } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!name || !normalizedEmail || !password) return res.status(400).json({ message: 'Name, email and password are required' });
    if (String(name).trim().length < 2 || String(name).trim().length > 80) return res.status(400).json({ message: 'Name must be between 2 and 80 characters' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) return res.status(400).json({ message: 'Enter a valid email address' });
    if (phone && !/^[+0-9()\-\s]{7,20}$/.test(String(phone))) return res.status(400).json({ message: 'Enter a valid phone number' });
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) return res.status(400).json({ message: 'Password must be between 8 and 128 characters' });
    const exists = await User.findOne({ email: normalizedEmail });
    if (exists) return res.status(409).json({ message: 'Email is already registered' });
    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ name: String(name).trim(), email: normalizedEmail, password: passwordHash, phone, address });
    const session = await startSession(req, res, user);
    res.status(201).json({ ...session, user: publicUser(user), accessTokenExpiresIn: ACCESS_TTL });
  } catch (error) { next(error); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body || {};
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail || typeof password !== 'string') return res.status(400).json({ message: 'Email and password are required' });
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Invalid email or password' });
    const session = await startSession(req, res, user);
    res.json({ ...session, user: publicUser(user), accessTokenExpiresIn: ACCESS_TTL });
  } catch (error) { next(error); }
});

router.post('/refresh', async (req, res) => {
  try {
    const rawToken = readCookie(req, REFRESH_COOKIE);
    if (!rawToken) return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    const session = await Session.findOne({
      refreshTokenHash: tokenHash(rawToken),
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    }).select('+refreshTokenHash');
    if (!session) {
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      return res.status(401).json({ message: 'Session expired. Please sign in again.' });
    }
    const user = await User.findById(session.user);
    if (!user) {
      session.revokedAt = new Date();
      await session.save();
      res.clearCookie(REFRESH_COOKIE, cookieOptions());
      return res.status(401).json({ message: 'Account no longer exists.' });
    }
    const nextRefreshToken = crypto.randomBytes(48).toString('hex');
    session.refreshTokenHash = tokenHash(nextRefreshToken);
    session.lastUsedAt = new Date();
    session.expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);
    await session.save();
    res.cookie(REFRESH_COOKIE, nextRefreshToken, cookieOptions());
    res.json({ accessToken: createAccessToken(user, session._id), sessionId: String(session._id), user: publicUser(user), accessTokenExpiresIn: ACCESS_TTL });
  } catch (error) {
    res.status(401).json({ message: 'Could not refresh session. Please sign in again.' });
  }
});

router.post('/logout', async (req, res) => {
  try {
    const rawToken = readCookie(req, REFRESH_COOKIE);
    if (rawToken) await Session.findOneAndUpdate({ refreshTokenHash: tokenHash(rawToken), revokedAt: null }, { $set: { revokedAt: new Date() } });
  } finally {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
  }
  res.json({ message: 'This device has been signed out.' });
});

router.post('/logout-all', protect, async (req, res, next) => {
  try {
    await Session.updateMany({ user: req.user._id, revokedAt: null }, { $set: { revokedAt: new Date() } });
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    res.json({ message: 'All devices have been signed out.' });
  } catch (error) { next(error); }
});

router.get('/sessions', protect, async (req, res, next) => {
  try {
    const sessions = await Session.find({ user: req.user._id, revokedAt: null, expiresAt: { $gt: new Date() } })
      .select('deviceName userAgent ipAddress createdAt lastUsedAt expiresAt')
      .sort({ lastUsedAt: -1 })
      .lean();
    res.json({ sessions: sessions.map(s => ({
      id: String(s._id), deviceName: s.deviceName, userAgent: s.userAgent,
      ipAddress: s.ipAddress, createdAt: s.createdAt, lastUsedAt: s.lastUsedAt, expiresAt: s.expiresAt,
      current: String(s._id) === String(req.authSessionId)
    })) });
  } catch (error) { next(error); }
});

router.delete('/sessions/:sessionId', protect, async (req, res, next) => {
  try {
    if (!/^[a-f\d]{24}$/i.test(req.params.sessionId)) return res.status(400).json({ message: 'Invalid session ID' });
    const session = await Session.findOneAndUpdate(
      { _id: req.params.sessionId, user: req.user._id, revokedAt: null },
      { $set: { revokedAt: new Date() } },
      { new: true }
    );
    if (!session) return res.status(404).json({ message: 'Active session not found' });
    if (String(session._id) === String(req.authSessionId)) res.clearCookie(REFRESH_COOKIE, cookieOptions());
    res.json({ message: 'Session signed out.' });
  } catch (error) { next(error); }
});

router.get('/me', protect, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = router;
