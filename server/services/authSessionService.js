const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { supabase } = require('../config/supabase');
const { assertAccountCanAuthenticate, normalizeAccountRole } = require('./authAccountPolicy');
const { getVerifiedPassword } = require('./credentialProof');

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_NAME = 'swipenest_refresh';
const COOKIE_PATH = '/api/auth';
const USER_COLUMNS = 'id, name, email, avatar, role, phone, phone_verified, email_verified_at, verification_status, trust_score, is_active';

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
  if (typeof token !== 'string' || token.length > 8192) {
    throw new Error('Invalid access token claims');
  }
  const { secret, issuer, audience } = getJwtConfig();
  const payload = jwt.verify(token, secret, {
    algorithms: ['HS256'],
    issuer,
    audience
  });

  if (!payload || typeof payload !== 'object' || payload.token_use !== 'access'
    || !/^[1-9]\d*$/.test(payload.sub || '')
    || typeof payload.sid !== 'string'
    || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(payload.sid)
    || !Number.isFinite(payload.exp)) {
    throw new Error('Invalid access token claims');
  }

  return payload;
};

const getUserById = async (userId) => {
  const read = (columns) => supabase.from('users').select(columns).eq('id', userId).maybeSingle();
  // Database chưa có cột is_official (chưa chạy migration 026): đăng nhập vẫn phải hoạt động,
  // nên mọi lỗi của truy vấn mở rộng đều được thử lại với bộ cột gốc.
  let user;
  let error;
  try { ({ data: user, error } = await read(`${USER_COLUMNS}, is_official`)); } catch (thrown) { error = thrown; }
  if (error) ({ data: user, error } = await read(USER_COLUMNS));

  if (error) throw new Error(error.message);
  return user ? { ...user, role: normalizeAccountRole(user.role) } : null;
};

const isLiveSession = (session) => Boolean(session && !session.revoked_at
  && Number.isFinite(Date.parse(session.expires_at)) && Date.parse(session.expires_at) > Date.now());

const getAuthenticatedUser = async (token) => {
  const payload = verifyAccessToken(token);
  // Mỗi request API đều qua đây: đọc phiên và tài khoản song song (một vòng mạng thay vì hai, ~250ms mỗi vòng tới
  // Supabase). User id lấy từ token đã ký; vẫn chỉ trả về tài khoản khi phiên còn sống và đúng của user đó.
  const [{ data: session, error }, user] = await Promise.all([
    supabase.from('auth_sessions')
      .select('id, user_id, expires_at, revoked_at')
      .eq('id', payload.sid)
      .maybeSingle(),
    getUserById(payload.sub)
  ]);

  if (error) throw new Error(error.message);
  if (!isLiveSession(session) || String(session.user_id) !== payload.sub) {
    return null;
  }

  if (!user) return null;
  assertAccountCanAuthenticate(user);
  return user;
};

const createSession = async (user) => {
  if (!user?.id) assertAccountCanAuthenticate(null);
  // Re-read account state rather than trusting a caller's cached role or activation flag.
  const account = await getUserById(user?.id);
  assertAccountCanAuthenticate(account);
  if (!account.email_verified_at) {
    const error = new Error('Verify your email before signing in');
    error.statusCode = 403;
    error.code = 'EMAIL_VERIFICATION_REQUIRED';
    throw error;
  }

  const proof = getVerifiedPassword(user);
  const credentialUnchanged = async () => {
    if (proof === undefined) return true;
    const { data, error } = await supabase.from('users').select('password').eq('id', account.id).maybeSingle();
    if (error) throw new Error('Could not validate session credential');
    return data?.password === proof;
  };
  const credentialChanged = () => Object.assign(new Error('Mật khẩu vừa thay đổi. Vui lòng đăng nhập lại.'), { statusCode: 401 });
  if (!await credentialUnchanged()) throw credentialChanged();

  const refreshToken = generateRefreshToken();
  const { data: session, error } = await supabase
    .from('auth_sessions')
    .insert({
      user_id: account.id,
      refresh_token_hash: hashToken(refreshToken),
      expires_at: new Date(Date.now() + REFRESH_TOKEN_TTL_MS).toISOString()
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message);

  // A password change may finish while this session insert was in flight.
  // Recheck after insertion, closing the delayed old-password login window.
  if (!await credentialUnchanged()) {
    const { error: revokeError } = await supabase.from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() }).eq('id', session.id);
    if (revokeError) throw new Error('Could not revoke stale credential session');
    throw credentialChanged();
  }

  return {
    user: account,
    accessToken: signAccessToken(account.id, session.id),
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

const ROTATE_RPC_MISSING_CODES = new Set(['PGRST202', '42883', '42P01', '42703']);
const ROTATE_RPC_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
let rotateRpcRetryAfter = 0;

const refreshSession = async (refreshToken) => {
  if (typeof refreshToken !== 'string' || !/^[A-Za-z0-9_-]{64}$/.test(refreshToken)) return null;

  const oldHash = hashToken(refreshToken);
  const newRefreshToken = generateRefreshToken();
  const newHash = hashToken(newRefreshToken);

  if (Date.now() >= rotateRpcRetryAfter && typeof supabase.rpc === 'function') {
    let rpcResult;
    let rpcFailed = false;
    try {
      rpcResult = await supabase.rpc('rotate_auth_session', {
        p_old_hash: oldHash,
        p_new_hash: newHash
      });
    } catch {
      rpcFailed = true;
    }

    if (!rpcFailed && rpcResult) {
      const { data, error } = rpcResult;
      if (!error) {
        if (!data || !data.session_id || !data.user) return null;
        const user = { ...data.user, role: normalizeAccountRole(data.user.role) };
        if (!user.email_verified_at) return null;
        try {
          assertAccountCanAuthenticate(user);
        } catch {
          return null;
        }
        return {
          user,
          accessToken: signAccessToken(user.id, data.session_id),
          refreshToken: newRefreshToken,
          ...(typeof data.onboarding_completed === 'boolean'
            ? { onboardingCompleted: data.onboarding_completed }
            : {})
        };
      }
      if (ROTATE_RPC_MISSING_CODES.has(error.code) || /rotate_auth_session/i.test(error.message || '')) {
        rotateRpcRetryAfter = Date.now() + ROTATE_RPC_RETRY_COOLDOWN_MS;
      } else if (!/fetch failed|network|ENOTFOUND|ECONNREFUSED/i.test(error.message || '')) {
        throw new Error(error.message);
      }
    }
  }

  const { data: session, error } = await supabase
    .from('auth_sessions')
    .select('id, user_id, expires_at, revoked_at')
    .eq('refresh_token_hash', oldHash)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!isLiveSession(session)) {
    return null;
  }

  const user = await getUserById(session.user_id);
  if (!user || !user.email_verified_at) return null;
  try {
    assertAccountCanAuthenticate(user);
  } catch {
    return null;
  }

  const { data: rotated, error: rotationError } = await supabase
    .from('auth_sessions')
    .update({
      refresh_token_hash: newHash,
      rotated_at: new Date().toISOString()
    })
    .eq('id', session.id)
    .eq('refresh_token_hash', oldHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
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

const revokeSession = async (refreshToken, accessToken) => {
  let payload;
  if (accessToken) {
    try { payload = verifyAccessToken(accessToken); } catch (error) {
      if (!['TokenExpiredError', 'JsonWebTokenError', 'NotBeforeError'].includes(error.name)
        && error.message !== 'Invalid access token claims') throw error;
    }
  }
  // Revoke by the signed session id too: a refresh may have rotated the cookie
  // while logout was in flight, or a browser may omit third-party cookies.
  if (payload) {
    const { error } = await supabase.from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', payload.sid).eq('user_id', payload.sub);
    if (error) throw new Error(error.message);
  }
  if (typeof refreshToken === 'string' && /^[A-Za-z0-9_-]{64}$/.test(refreshToken)) {
    const { error } = await supabase.from('auth_sessions')
      .update({ revoked_at: new Date().toISOString() })
      .eq('refresh_token_hash', hashToken(refreshToken));
    if (error) throw new Error(error.message);
  }
};

const revokeAllUserSessions = async (userId) => {
  const { error } = await supabase.from('auth_sessions')
    .update({ revoked_at: new Date().toISOString() })
    .eq('user_id', userId).is('revoked_at', null);
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
  revokeAllUserSessions,
  setRefreshCookie,
  clearRefreshCookie,
  verifyAccessToken
};
