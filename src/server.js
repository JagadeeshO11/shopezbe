require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth.routes');
const productRoutes = require('./routes/product.routes');
const userRoutes = require('./routes/user.routes');
const cartRoutes = require('./routes/cart.routes');
const orderRoutes = require('./routes/order.routes');
const wishlistRoutes = require('./routes/wishlist.routes');
const shareRoutes = require('./routes/share.routes');

const app = express();
const PORT = process.env.PORT || 5000;
const configuredOrigins = (process.env.CLIENT_URL || '')
  .split(',').map(value => value.trim()).filter(Boolean);
const allowedOrigins = new Set([
  'http://localhost:3000',
  'https://shopez-jagadeesho11s-projects.vercel.app',
  ...configuredOrigins
]);

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) return callback(null, true);
    if (/^https:\/\/shopez(?:-[a-z0-9-]+)?\.vercel\.app$/i.test(origin)) return callback(null, true);
    return callback(new Error('CORS origin not allowed'));
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

app.get('/', (_req, res) => res.json({ name: 'ShopEZ API', version: '1.1.0', status: 'running' }));
app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'shopezbe', database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/cart', cartRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/wishlist', wishlistRoutes);
app.use('/api/v1/shares', shareRoutes);

app.use((req, res) => res.status(404).json({ message: 'Route not found', path: req.originalUrl }));
app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Internal server error' });
});

async function start() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not configured');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is not configured');
  await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB || 'shopez' });
  app.listen(PORT, () => console.log(`ShopEZ backend listening on port ${PORT}`));
}

if (require.main === module) start().catch(error => { console.error('Startup failed:', error.message); process.exit(1); });
module.exports = app;
