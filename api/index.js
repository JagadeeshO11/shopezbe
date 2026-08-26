const { app, connectDB } = require('../src/server');

module.exports = async (req, res) => {
  try {
    await connectDB();
    return app(req, res);
  } catch (error) {
    console.error('API database connection failed:', error.message);
    return res.status(503).json({
      message: 'Database unavailable. Check MongoDB Atlas network access and Vercel environment variables.',
      code: 'DATABASE_UNAVAILABLE'
    });
  }
};
