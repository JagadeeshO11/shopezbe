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
  if (!pair) return '';
  try { return decodeURIComponent(pair.slice(name.length + 1)); } catch { return ''; }
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
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
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
    if (!user || !user.password || !(await bcrypt.compare(password, user.password))) return res.status(401).json({ message: 'Invalid email or password' });
    const session = await startSession(req, res, user);
    res.json({ ...session, user: publicUser(user), accessTokenExpiresIn: ACCESS_TTL });
  } catch (error) { next(error); }
});


function otpHash(email, code) {
  return crypto.createHash('sha256').update(`${email}:${code}:${process.env.JWT_SECRET || 'local-only-change-this'}`).digest('hex');
}

async function sendOtpEmail(email, code) {
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) {
    const error = new Error('Email delivery is not configured. Set RESEND_API_KEY and EMAIL_FROM in your local .env file.');
    error.status = 503;
    throw error;
  }
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM,
      to: [email],
      subject: 'Your ShopEZ sign-in code',
      text: `Your ShopEZ verification code is ${code}. It expires in 10 minutes. If you did not request this code, you can ignore this email.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;padding:24px"><h2>ShopEZ verification</h2><p>Use this one-time code to continue:</p><p style="font-size:32px;letter-spacing:8px;font-weight:700">${code}</p><p>This code expires in 10 minutes. Never share it with anyone.</p></div>`
    })
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    console.error('ShopEZ OTP email provider rejected the request:', response.status, detail.slice(0, 300));
    const error = new Error('Could not send the verification email. Check your email provider configuration.');
    error.status = 502;
    throw error;
  }
}

async function requestOtp(req, res, next) {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    const OtpChallenge = require('../models/OtpChallenge');
    const now = new Date();
    let challenge = await OtpChallenge.findOne({ email });
    if (challenge && challenge.lastSentAt && now - challenge.lastSentAt < 60 * 1000) {
      return res.status(429).json({ message: 'Please wait 60 seconds before requesting another code.' });
    }
    const withinWindow = challenge?.createdAt && now - challenge.createdAt < 15 * 60 * 1000;
    if (withinWindow && challenge.sends >= 3) {
      return res.status(429).json({ message: 'Too many codes requested. Try again in 15 minutes.' });
    }
    const code = String(crypto.randomInt(100000, 1000000));
    const sends = withinWindow ? challenge.sends + 1 : 1;
    if (!challenge) challenge = new OtpChallenge({ email });
    challenge.codeHash = otpHash(email, code);
    challenge.expiresAt = new Date(now.getTime() + 10 * 60 * 1000);
    challenge.attempts = 0;
    challenge.sends = sends;
    challenge.lastSentAt = now;
    challenge.consumedAt = null;
    await challenge.save();
    await sendOtpEmail(email, code);
    return res.json({ message: 'If this email can receive ShopEZ verification messages, a code has been sent. Check your inbox and spam folder.' });
  } catch (error) { next(error); }
}

router.post('/otp/request', requestOtp);
router.post('/otp/resend', requestOtp);

router.post('/otp/verify', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const code = String(req.body?.code || '').trim();
    const name = String(req.body?.name || '').trim();
    if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(email) || !/^\\d{6}$/.test(code)) {
      return res.status(400).json({ message: 'Enter the email address and six-digit code.' });
    }
    const OtpChallenge = require('../models/OtpChallenge');
    const challenge = await OtpChallenge.findOne({ email });
    if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date()) {
      return res.status(400).json({ message: 'That code has expired or is invalid. Request a new code.' });
    }
    if (challenge.attempts >= 5) {
      return res.status(429).json({ message: 'Too many incorrect attempts. Request a new code.' });
    }
    const expected = Buffer.from(challenge.codeHash, 'hex');
    const supplied = Buffer.from(otpHash(email, code), 'hex');
    const matches = expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
    if (!matches) {
      challenge.attempts += 1;
      await challenge.save();
      return res.status(challenge.attempts >= 5 ? 429 : 400).json({
        message: challenge.attempts >= 5 ? 'Too many incorrect attempts. Request a new code.' : 'That code is incorrect.'
      });
    }
    let user = await User.findOne({ email });
    if (!user && (name.length < 2 || name.length > 80)) {
      return res.status(400).json({ message: 'Enter your full name to create your ShopEZ account.' });
    }
    challenge.consumedAt = new Date();
    await challenge.save();
    if (!user) {
      try {
        user = await User.create({ name, email, password: undefined, phone: '' });
      } catch (error) {
        if (error.code !== 11000) throw error;
        user = await User.findOne({ email });
      }
    }
    if (!user) return res.status(500).json({ message: 'Could not complete sign-in. Please try again.' });
    const session = await startSession(req, res, user);
    return res.json({ ...session, user: publicUser(user), accessTokenExpiresIn: ACCESS_TTL });
  } catch (error) { next(error); }
});

router.post('/google', async (req, res, next) => {
  try {
    const credential = String(req.body?.credential || '');
    if (!credential || credential.length > 10000) return res.status(400).json({ message: 'A valid Google credential is required.' });
    if (!process.env.GOOGLE_CLIENT_ID) return res.status(503).json({ message: 'Google sign-in is not configured. Set GOOGLE_CLIENT_ID in the backend .env file.' });
    const verifyResponse = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
    if (!verifyResponse.ok) return res.status(401).json({ message: 'Google sign-in could not be verified.' });
    const claims = await verifyResponse.json();
    if (claims.aud !== process.env.GOOGLE_CLIENT_ID || claims.email_verified !== 'true' || !claims.email || !claims.sub) {
      return res.status(401).json({ message: 'Google sign-in could not be verified.' });
    }
    const email = String(claims.email).trim().toLowerCase();
    let user = await User.findOne({ email });
    if (!user) {
      const name = String(claims.name || claims.given_name || 'ShopEZ customer').trim().slice(0, 80);
      try {
        user = await User.create({ name, email, password: undefined, phone: '' });
      } catch (error) {
        if (error.code !== 11000) throw error;
        user = await User.findOne({ email });
      }
    }
    if (!user) return res.status(500).json({ message: 'Could not complete Google sign-in. Please try again.' });
    const session = await startSession(req, res, user);
    return res.json({ ...session, user: publicUser(user), accessTokenExpiresIn: ACCESS_TTL });
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
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    return res.json({ message: 'This device has been signed out.' });
  } catch (error) {
    res.clearCookie(REFRESH_COOKIE, cookieOptions());
    return res.status(503).json({ message: 'Could not confirm server-side sign-out. Please try again.' });
  }
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
