const authSessionService = require('../services/authSessionService');
const { assertAccountCanAuthenticate } = require('../services/authAccountPolicy');

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

    assertAccountCanAuthenticate(user);

    if (!user.email_verified_at) {
      return res.status(403).json({
        error: 'Hãy xác minh email trước khi sử dụng tài khoản này',
        code: 'EMAIL_VERIFICATION_REQUIRED'
      });
    }

    req.user = user;
    return next();
  } catch (error) {
    if (error.name === 'TokenExpiredError' || error.name === 'JsonWebTokenError' || error.name === 'NotBeforeError'
      || error.message === 'Invalid access token claims') {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    if (error.statusCode === 403 && ['ACCOUNT_DISABLED', 'ACCOUNT_ROLE_INVALID'].includes(error.code)) {
      return res.status(403).json({ error: error.message, code: error.code });
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

const optionalAuthenticate = async (req, res, next) => {
  const authorization = req.get('authorization') || '';
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization);
  if (!match) {
    return next();
  }

  try {
    const user = await authSessionService.getAuthenticatedUser(match[1]);
    if (user && user.email_verified_at) {
      assertAccountCanAuthenticate(user);
      req.user = user;
    }
  } catch (error) {
    // Silently continue for optional auth
  }

  return next();
};

module.exports = { authenticate, requireRole, optionalAuthenticate };
