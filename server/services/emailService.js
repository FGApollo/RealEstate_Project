const crypto = require('node:crypto');

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_SEND_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send';
const TOKEN_REFRESH_SKEW_MS = 60_000;

const isMailboxAddress = (value) => (
  typeof value === 'string'
  && value.length <= 254
  && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value)
);

const readConfig = (env = process.env) => {
  const clientId = env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = env.GMAIL_REFRESH_TOKEN?.trim();
  const senderEmail = env.GMAIL_SENDER_EMAIL?.trim();
  const frontendUrl = env.FRONTEND_URL?.trim();

  if (!clientId || !clientSecret || !refreshToken || !isMailboxAddress(senderEmail) || !frontendUrl) {
    return null;
  }

  let frontendOrigin;
  try {
    const parsed = new URL(frontendUrl);
    if (!['https:', 'http:'].includes(parsed.protocol)
      || parsed.origin !== frontendUrl
      || (parsed.protocol === 'http:' && !['localhost', '127.0.0.1'].includes(parsed.hostname))) {
      return null;
    }
    frontendOrigin = parsed.origin;
  } catch {
    return null;
  }

  return { clientId, clientSecret, refreshToken, senderEmail, frontendOrigin };
};

const configurationError = () => {
  const error = new Error('Email verification delivery is not configured');
  error.statusCode = 503;
  error.code = 'EMAIL_DELIVERY_UNAVAILABLE';
  return error;
};

const assertConfigured = () => {
  if (!readConfig()) throw configurationError();
};

let cachedAccessToken;
let cachedAccessTokenExpiresAt = 0;
let tokenRefreshPromise;

const getAccessToken = async (config) => {
  if (cachedAccessToken && Date.now() < cachedAccessTokenExpiresAt - TOKEN_REFRESH_SKEW_MS) {
    return cachedAccessToken;
  }
  if (tokenRefreshPromise) return tokenRefreshPromise;

  tokenRefreshPromise = (async () => {
    const form = new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token'
    });

    let response;
    try {
      response = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        signal: AbortSignal.timeout(15_000)
      });
    } catch {
      const error = new Error('Google OAuth token request failed');
      error.code = 'GMAIL_OAUTH_REQUEST_FAILED';
      throw error;
    }

    let tokenData;
    try {
      tokenData = await response.json();
    } catch {
      tokenData = null;
    }

    if (!response.ok || typeof tokenData?.access_token !== 'string'
      || !Number.isFinite(Number(tokenData.expires_in))) {
      const error = new Error('Google OAuth token refresh was rejected');
      error.code = 'GMAIL_OAUTH_REFRESH_REJECTED';
      throw error;
    }

    cachedAccessToken = tokenData.access_token;
    cachedAccessTokenExpiresAt = Date.now() + Number(tokenData.expires_in) * 1000;
    return cachedAccessToken;
  })();

  try {
    return await tokenRefreshPromise;
  } finally {
    tokenRefreshPromise = null;
  }
};

const encodeMimeHeader = (value) => `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
const encodeMimeBody = (value) => Buffer.from(value, 'utf8').toString('base64')
  .replace(/.{1,76}/g, '$&\r\n')
  .trimEnd();

const toBase64Url = (value) => Buffer.from(value, 'utf8').toString('base64')
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=+$/g, '');

const buildRawMessage = ({ from, to, subject, text, html }) => {
  const boundary = `swipenest_${crypto.randomBytes(18).toString('hex')}`;
  const message = [
    `From: Swipe Nest <${from}>`,
    `To: ${to}`,
    `Subject: ${encodeMimeHeader(subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimeBody(text),
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    encodeMimeBody(html),
    `--${boundary}--`,
    ''
  ].join('\r\n');

  return toBase64Url(message);
};

const sendVerificationEmail = async ({ email, token }) => {
  const config = readConfig();
  if (!config) throw configurationError();
  if (!isMailboxAddress(email)) {
    const error = new Error('Recipient email address is invalid');
    error.code = 'EMAIL_RECIPIENT_INVALID';
    throw error;
  }

  const verificationUrl = new URL('/verify-email', config.frontendOrigin);
  verificationUrl.hash = `token=${encodeURIComponent(token)}`;
  const link = verificationUrl.toString();
  const text = `Mở liên kết để xác minh email Swipe Nest của bạn: ${link}\nLiên kết hết hạn sau 24 giờ. Nếu bạn không tạo tài khoản này, hãy bỏ qua email.`;
  const html = `<p>Hãy xác minh địa chỉ email cho tài khoản Swipe Nest.</p><p><a href="${link}">Xác minh email</a></p><p>Liên kết hết hạn sau 24 giờ. Nếu bạn không tạo tài khoản này, hãy bỏ qua email.</p>`;
  const raw = buildRawMessage({
    from: config.senderEmail,
    to: email,
    subject: 'Xác minh email Swipe Nest',
    text,
    html
  });

  const accessToken = await getAccessToken(config);
  let response;
  try {
    response = await fetch(GMAIL_SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ raw }),
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    const error = new Error('Gmail API request failed');
    error.code = 'GMAIL_API_REQUEST_FAILED';
    throw error;
  }

  if (!response.ok) {
    const error = new Error('Gmail API rejected the verification email');
    error.code = 'GMAIL_API_SEND_REJECTED';
    throw error;
  }
};

module.exports = { assertConfigured, readConfig, sendVerificationEmail };
