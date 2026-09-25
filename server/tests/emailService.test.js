const test = require('node:test');
const assert = require('node:assert/strict');
const emailService = require('../services/emailService');

const validConfig = {
  GMAIL_CLIENT_ID: 'test-client.apps.googleusercontent.com',
  GMAIL_CLIENT_SECRET: 'test-client-secret',
  GMAIL_REFRESH_TOKEN: 'test-refresh-token',
  GMAIL_SENDER_EMAIL: 'sender@gmail.com',
  FRONTEND_URL: 'https://swipenest.example'
};

test('Gmail API configuration requires OAuth credentials and a safe frontend origin', () => {
  assert.deepEqual(emailService.readConfig(validConfig), {
    clientId: validConfig.GMAIL_CLIENT_ID,
    clientSecret: validConfig.GMAIL_CLIENT_SECRET,
    refreshToken: validConfig.GMAIL_REFRESH_TOKEN,
    senderEmail: validConfig.GMAIL_SENDER_EMAIL,
    frontendOrigin: validConfig.FRONTEND_URL
  });
  assert.equal(emailService.readConfig({ ...validConfig, GMAIL_REFRESH_TOKEN: '' }), null);
  assert.equal(emailService.readConfig({ ...validConfig, GMAIL_SENDER_EMAIL: 'bad address' }), null);
  assert.equal(emailService.readConfig({ ...validConfig, FRONTEND_URL: 'https://swipenest.example/path' }), null);
});

test('verification email refreshes Gmail OAuth and sends a MIME message through Gmail API', async (t) => {
  const envKeys = Object.keys(validConfig);
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(validConfig)) process.env[key] = value;

  const originalFetch = global.fetch;
  const requests = [];
  global.fetch = async (url, options) => {
    requests.push({ url, options });
    if (url === 'https://oauth2.googleapis.com/token') {
      return {
        ok: true,
        json: async () => ({ access_token: 'short-lived-access-token', expires_in: 3600 })
      };
    }
    return { ok: true, json: async () => ({ id: 'sent-message-id' }) };
  };

  t.after(() => {
    global.fetch = originalFetch;
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  await emailService.sendVerificationEmail({
    email: 'recipient@example.com',
    token: 'A'.repeat(43)
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0].url, 'https://oauth2.googleapis.com/token');
  assert.equal(requests[0].options.method, 'POST');
  assert.match(String(requests[0].options.body), /grant_type=refresh_token/);
  assert.equal(requests[1].url, 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
  assert.equal(requests[1].options.headers.Authorization, 'Bearer short-lived-access-token');

  const raw = JSON.parse(requests[1].options.body).raw;
  const mime = Buffer.from(raw, 'base64url').toString('utf8');
  assert.match(mime, /From: Swipe Nest <sender@gmail\.com>/);
  assert.match(mime, /To: recipient@example\.com/);
  const decodedBodies = [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n(?=--)/g)]
    .map(([, body]) => Buffer.from(body.replace(/\s/g, ''), 'base64').toString('utf8'))
    .join('\n');
  assert.match(decodedBodies, /https:\/\/swipenest\.example\/verify-email#token=A{43}/);
  assert.match(decodedBodies, /Liên kết hết hạn sau 24 giờ/);
});

test('sendVerificationEmail fails closed without Gmail API credentials', async (t) => {
  const envKeys = Object.keys(validConfig);
  const previousEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  t.after(() => {
    for (const key of envKeys) {
      if (previousEnv[key] === undefined) delete process.env[key];
      else process.env[key] = previousEnv[key];
    }
  });

  await assert.rejects(
    emailService.sendVerificationEmail({ email: 'recipient@example.com', token: 'A'.repeat(43) }),
    (error) => error.code === 'EMAIL_DELIVERY_UNAVAILABLE' && error.statusCode === 503
  );
});
