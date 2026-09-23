const allowedOrigins = (process.env.CLIENT_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',').map((origin) => origin.trim()).filter(Boolean);

const requireTrustedOrigin = (req, res, next) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  return next();
};

module.exports = { allowedOrigins, requireTrustedOrigin };
