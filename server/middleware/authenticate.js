const authSessionService = require('../services/authSessionService');

const authenticate = async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const user = await authSessionService.getAuthenticatedUser(match[1]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError'
      || error.message === 'Invalid access token claims') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    return next(error);
  }
};

const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user || !allowedRoles.includes(String(req.user.role).toUpperCase())) {
    return res.status(403).json({ error: 'Permission denied' });
  }

  return next();
};

module.exports = { authenticate, requireRole };
