const { app } = require('../src/server');

// Vercel's Node runtime can invoke the Express application directly.
// Database connection is handled by the /api middleware in src/server.js.
module.exports = app;
