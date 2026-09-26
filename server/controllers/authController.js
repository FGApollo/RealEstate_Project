const authService = require('../services/authService');
const authSessionService = require('../services/authSessionService');
const emailVerificationService = require('../services/emailVerificationService');
const { createValidationError } = require('../services/registrationValidation');

const sendError = (res, error, fallback = 'Request failed') => res
  .status(error.statusCode || 500)
  .json({
    error: error.statusCode ? error.message : fallback,
    ...(error.code ? { code: error.code } : {}),
    ...(error.errors ? { errors: error.errors } : {})
  });

const respondWithSession = async (res, user, message) => {
  const { accessToken, refreshToken } = await authSessionService.createSession(user);
  authSessionService.setRefreshCookie(res, refreshToken);
  return res.status(200).json({ message, user, accessToken });
};

const register = async (req, res) => {
  try {
    const submitted = req.body || {};
    if (typeof submitted !== 'object' || Array.isArray(submitted)) {
      throw createValidationError({ request: 'Invalid registration request' });
    }
    if (Object.keys(submitted).some((key) => ![
      'name', 'email', 'password', 'confirmPassword', 'intent', 'phone'
    ].includes(key))) {
      throw createValidationError({ request: 'Unsupported registration field' });
    }
    const { name, email, password, confirmPassword, intent = 'USER_SIGNUP', phone } = submitted;
    if (!name || !email || !password || typeof confirmPassword !== 'string') {
      throw createValidationError({ request: 'Name, email, password and password confirmation are required' });
    }

    await authService.registerUser({ name, email, password, confirmPassword, intent, phone });
    res.status(202).json({
      message: emailVerificationService.GENERIC_MESSAGE,
      code: 'REGISTRATION_ACCEPTED'
    });
  } catch (error) {
    sendError(res, error, 'Registration failed');
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide email and password' });
    }

    const user = await authService.loginUser({ email, password });
    await respondWithSession(res, user, 'Login successful');
  } catch (error) {
    const statusCode = error.message === 'Invalid email or password' ? 401 : error.statusCode || 500;
    res.status(statusCode).json({
      error: statusCode < 500 ? error.message : 'Login failed',
      ...(error.code ? { code: error.code } : {})
    });
  }
};

const resendVerification = async (req, res) => {
  try {
    const submitted = req.body || {};
    if (typeof submitted !== 'object' || Array.isArray(submitted)
      || Object.keys(submitted).some((key) => key !== 'email')) {
      throw createValidationError({ request: 'Only email is accepted' });
    }
    const result = await emailVerificationService.resendVerification(submitted.email);
    return res.status(202).json({ ...result, code: 'VERIFICATION_REQUEST_ACCEPTED' });
  } catch (error) {
    return sendError(res, error, 'Verification request failed');
  }
};

const verifyEmail = async (req, res) => {
  try {
    const submitted = req.body || {};
    if (typeof submitted !== 'object' || Array.isArray(submitted)
      || Object.keys(submitted).some((key) => key !== 'token')) {
      throw createValidationError({ request: 'Only the verification token is accepted' });
    }
    const result = await emailVerificationService.verifyEmail(submitted.token);
    return res.status(200).json(result);
  } catch (error) {
    return sendError(res, error, 'Email verification failed');
  }
};

const googleLogin = async (req, res) => {
  try {
    const submitted = req.body || {};
    if (Object.keys(submitted).some((key) => !['credential', 'intent', 'phone', 'linkPassword'].includes(key))) {
      return res.status(400).json({ error: 'Unsupported Google authentication field' });
    }
    const { credential, intent = 'LOGIN', phone, linkPassword } = submitted;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential missing' });
    }

    const user = await authService.googleLogin(credential, intent, phone, linkPassword);
    await respondWithSession(res, user, 'Google login successful');
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) console.error('Google login error:', error);
    res.status(error.statusCode || 500)
      .json({
        error: error.statusCode ? error.message : 'Google authentication failed',
        ...(error.code ? { code: error.code } : {})
      });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await authService.getUserById(Number(id));
    res.status(200).json({ user });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

const refresh = async (req, res) => {
  try {
    const oldToken = authSessionService.getRefreshTokenFromRequest(req);
    const result = await authSessionService.refreshSession(oldToken);
    if (!result) {
      authSessionService.clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    authSessionService.setRefreshCookie(res, result.refreshToken);
    return res.status(200).json({ user: result.user, accessToken: result.accessToken });
  } catch (error) {
    console.error('Session refresh failed:', error);
    return res.status(500).json({ error: 'Session refresh failed' });
  }
};

const logout = async (req, res) => {
  try {
    await authSessionService.revokeSession(authSessionService.getRefreshTokenFromRequest(req));
    authSessionService.clearRefreshCookie(res);
    return res.status(204).end();
  } catch (error) {
    console.error('Logout failed:', error);
    return res.status(500).json({ error: 'Logout failed' });
  }
};

const me = (req, res) => res.status(200).json({ user: req.user });

module.exports = {
  register,
  resendVerification,
  verifyEmail,
  login,
  googleLogin,
  getUserById,
  refresh,
  logout,
  me
};
