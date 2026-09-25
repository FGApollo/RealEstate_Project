const DEVELOPMENT_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const configuredOrigins = process.env.CORS_ALLOWED_ORIGINS ?? process.env.CLIENT_ORIGINS;
const rawOrigins = configuredOrigins === undefined
  ? (process.env.NODE_ENV === 'production' ? null : DEVELOPMENT_ORIGINS.join(','))
  : configuredOrigins;

if (rawOrigins === null) {
  throw new Error('CORS_ALLOWED_ORIGINS must be set in production');
}

const parseOrigin = (value) => {
  const origin = value.trim();
  let parsed;
  try {
    parsed = new URL(origin);
  } catch {
    throw new Error(`Invalid CORS origin: ${origin}`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
    throw new Error(`CORS entries must be exact HTTP(S) origins without paths: ${origin}`);
  }

  return origin;
};

const allowedOrigins = [...new Set(rawOrigins.split(',').map(parseOrigin))];
if (allowedOrigins.length === 0) {
  throw new Error('CORS_ALLOWED_ORIGINS must contain at least one origin');
}

const corsOptions = {
  origin(origin, callback) {
    // Requests without Origin are non-browser clients; CORS adds no headers,
    // but the request can continue to normal authentication and authorization.
    callback(null, Boolean(origin && allowedOrigins.includes(origin)));
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 204
};

const requireTrustedOrigin = (req, res, next) => {
  const origin = req.get('origin');
  if (origin && !allowedOrigins.includes(origin)) {
    return res.status(403).json({ error: 'Origin not allowed' });
  }
  return next();
};

module.exports = { allowedOrigins, corsOptions, requireTrustedOrigin };
