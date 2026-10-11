const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Session = require('../models/Session');

async function protect(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ message: 'Authentication required' });
    const decoded = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    if (!decoded.sid) return res.status(401).json({ message: 'Please sign in again to refresh your session.' });
    const session = await Session.findOne({
      _id: decoded.sid,
      user: decoded.id,
      revokedAt: null,
      expiresAt: { $gt: new Date() }
    }).select('_id');
    if (!session) return res.status(401).json({ message: 'Session expired or signed out' });
    const user = await User.findById(decoded.id).select('-password');
    if (!user) return res.status(401).json({ message: 'User not found' });
    req.user = user;
    req.authSessionId = String(session._id);
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid or expired access token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ message: 'Admin access required' });
  next();
}

module.exports = { protect, adminOnly };
