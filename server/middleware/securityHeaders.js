const securityHeaders = (req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'"
  });
  if (req.secure || process.env.NODE_ENV === 'production') res.set('Strict-Transport-Security', 'max-age=31536000');
  if (req.path.startsWith('/api')) res.set('Cache-Control', 'no-store');
  next();
};

const apiErrorHandler = (error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Request body is too large' });
  if (error.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON request body' });
  if (error.type === 'encoding.unsupported' || error.type === 'charset.unsupported') return res.status(415).json({ error: 'Unsupported request encoding' });
  if (error.code?.startsWith('LIMIT_')) return res.status(400).json({ error: 'Invalid upload request or upload limit exceeded' });
  console.error('Unhandled API error:', error.code || error.name || 'unknown_error');
  return res.status(500).json({ error: 'Internal server error' });
};

const denyPrivateUploads = (req, res, next) => {
  let requested;
  try { requested = decodeURIComponent(req.path); } catch { return res.sendStatus(404); }
  if (requested.split(/[\\/]/).some((part) => /^evidence-/i.test(part))) return res.sendStatus(404);
  return next();
};

module.exports = { securityHeaders, apiErrorHandler, denyPrivateUploads };
