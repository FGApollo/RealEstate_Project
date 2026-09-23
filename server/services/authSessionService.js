const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'swipenest_refresh';
const COOKIE_PATH = '/api/auth';
const USER_COLUMNS = 'id, name, email, avatar, role, phone, verification_status, trust_score';

const getJwtConfig = () => {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of random data');
  }

  return {
    secret,
    issuer: process.env.JWT_ISSUER || 'swipenest-api',
    audience: process.env.JWT_AUDIENCE || 'swipenest-web'
  };
};

const getCookieOptions = () => {
  const sameSite = (process.env.AUTH_COOKIE_SAME_SITE || 'lax').toLowerCase();
  if (!['strict', 'lax', 'none'].includes(sameSite)) {
    throw new Error('AUTH_COOKIE_SAME_SITE must be strict, lax, or none');
  }
  const secure = process.env.NODE_ENV === 'production' || sameSite === 'none';

  return {
    httpOnly: true,
    secure,
    sameSite,
    path: COOKIE_PATH
  };
};

const generateRefreshToken = () => crypto.randomBytes(48).toString('base64url');
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const signAccessToken = (userId, sessionId) => {
  const { secret, issuer, audience } = getJwtConfig();
  return jwt.sign(
    { token_use: 'access', sid: sessionId },
    secret,
    {
      algorithm: 'HS256',
      subject: String(userId),
      issuer,
      audience,
      jwtid: crypto.randomUUID(),
      expiresIn: ACCESS_TOKEN_TTL
    }
  );
};

const verifyAccessToken = (token) => {
  const { secret, issuer, audience } = getJwtConfig();
  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer,
    audience
  });

  if (payload.token_use !== 'access' || !/^\d+$/.test(payload.sub || '') || !payload.sid) {
    throw new Error('Invalid access token claims');
  }

  return payload;
};

const getUserById = async (userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select(USER_COLUMNS)
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return user;
};

const getAuthenticatedUser = async (token) => {
  const payload = verifyAccessToken(token);
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('id, user_id, expires_at, revoked_at')
    .eq('id', payload.sid)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()
    || String(session.user_id) !== payload.sub) {
    return null;
  }

  return getUserById(session.user_id);
};

const createSession = async (user) => {
  const refreshToken = generateRefreshToken();
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .insert({
      user_id: user.id,
      refresh_token_hash: hashToken(refreshToken),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString()
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  return {
    accessToken: signAccessToken(user.id, session.id),
    refreshToken
  };
};

const getRefreshTokenFromRequest = (req) => {
  const cookies = req.headers.cookie || '';
  const item = cookies.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!item) return null;
  try {
    return decodeURIComponent(item.slice(COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
};

const refreshSession = async (refreshToken) => {
  if (!refreshToken) return null;

  const oldHash = hashToken(refreshToken);
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('id, user_id, expires_at, revoked_at')
    .eq('refresh_token_hash', oldHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!session || session.revoked_at || new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  const user = await getUserById(session.user_id);
  if (!user) return null;

  const newRefreshToken = generateRefreshToken();
  const { data: rotated, error: rotationError } = await supabase
    .from('auth_sessions')
    .update({
      refresh_token_hash: hashToken(newRefreshToken),
      rotated_at: new Date().toISOString()
    })
    .eq('id', session.id)
    .eq('refresh_token_hash', oldHash)
    .is('revoked_at', null)
    .select('id')
    .maybeSingle();

  if (rotationError) throw new Error(rotationError.message);
  if (!rotated) return null;

  return {
    user,
    accessToken: signAccessToken(user.id, session.id),
    refreshToken: newRefreshToken
  };
};

const revokeSession = async (refreshToken) => {
  if (!refreshToken) return;

  const { error } = await supabase
    .from('auth_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('refresh_token_hash', hashToken(refreshToken));

  if (error) throw new Error(error.message);
};

const setRefreshCookie = (res, token) => {
  res.cookie(COOKIE_NAME, token, {
    ...getCookieOptions(),
    maxAge: REFRESH_TOKEN_TTL_MS
  });
};

const clearRefreshCookie = (res) => {
  res.clearCookie(COOKIE_NAME, getCookieOptions());
};

module.exports = {
  getJwtConfig,
  getCookieOptions,
  getAuthenticatedUser,
  getRefreshTokenFromRequest,
  createSession,
  refreshSession,
  revokeSession,
  setRefreshCookie,
  clearRefreshCookie,
  verifyAccessToken
};
