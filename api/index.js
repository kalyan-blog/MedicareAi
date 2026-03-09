let app;
try {
  app = require('../backend/server');
} catch (err) {
  console.error('Failed to load backend/server:', err);
  // Return a minimal handler that reports the error
  app = (req, res) => {
    res.status(500).json({ error: 'Server initialization failed', details: err.message });
  };
}

module.exports = app;
