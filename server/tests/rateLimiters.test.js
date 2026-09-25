const assert = require('node:assert/strict');
const test = require('node:test');
const express = require('express');
const { createRateLimiters, normalizeEmail, normalizePhone } = require('../middleware/rateLimiters');
const { getOtpSendLimits, createOtpQuotaHash } = require('../services/otpSendPolicy');

const startServer = async (app) => {
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  return {
    server,
    baseUrl: `http://127.0.0.1:${server.address().port}`
  };
};

test('identifier normalization is stable for email casing and whitespace', () => {
  assert.equal(normalizeEmail('  TEST@Example.COM '), 'test@example.com');
  assert.equal(normalizePhone(' 0901234567 '), '0901234567');
});

test('billable OTP sending fails closed without all product quota values', () => {
  assert.equal(getOtpSendLimits({}), null);
  assert.equal(getOtpSendLimits({
    OTP_SEND_MAX_PER_PHONE_PER_HOUR: '5',
    OTP_SEND_MAX_PER_PHONE_PER_DAY: '10'
  }), null);
  assert.deepEqual(getOtpSendLimits({
    OTP_SEND_MAX_PER_PHONE_PER_HOUR: '5',
    OTP_SEND_MAX_PER_PHONE_PER_DAY: '10',
    OTP_SEND_MAX_GLOBAL_PER_DAY: '100'
  }), { maxPerHour: 5, maxPerDay: 10, maxGlobalPerDay: 100 });
});

test('OTP quota keys are deterministic HMACs rather than raw phone numbers', () => {
  const key = createOtpQuotaHash('0901234567', 'test-secret');
  assert.match(key, /^[0-9a-f]{64}$/);
  assert.equal(createOtpQuotaHash('0901234567', 'test-secret'), key);
  assert.notEqual(createOtpQuotaHash('0901234568', 'test-secret'), key);
});

test('API baseline returns a standard 429 response and rate-limit headers', async (t) => {
  const limiters = createRateLimiters({ apiLimit: 2, apiWindowMs: 60_000 });
  const app = express();
  app.use('/api', limiters.api);
  app.get('/api/ping', (_req, res) => res.status(200).json({ ok: true }));
  const { server, baseUrl } = await startServer(app);
  t.after(() => server.close());

  assert.equal((await fetch(`${baseUrl}/api/ping`)).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/ping`)).status, 200);
  const limited = await fetch(`${baseUrl}/api/ping`);
  const body = await limited.json();

  assert.equal(limited.status, 429);
  assert.equal(body.code, 'RATE_LIMITED');
  assert.ok(limited.headers.get('retry-after'));
  assert.ok(limited.headers.get('ratelimit'));
});

test('message limiter isolates authenticated users', async (t) => {
  const limiters = createRateLimiters({ messageLimit: 1, messageWindowMs: 60_000 });
  const app = express();
  app.use((req, _res, next) => {
    req.user = { id: req.get('x-test-user') };
    next();
  });
  app.post('/messages', limiters.message, (_req, res) => res.status(201).end());
  const { server, baseUrl } = await startServer(app);
  t.after(() => server.close());

  const send = (userId) => fetch(`${baseUrl}/messages`, {
    method: 'POST',
    headers: { 'x-test-user': userId }
  });
  assert.equal((await send('user-a')).status, 201);
  assert.equal((await send('user-a')).status, 429);
  assert.equal((await send('user-b')).status, 201);
});

test('login limiter normalizes email and keeps different accounts separate', async (t) => {
  const limiters = createRateLimiters({ loginLimit: 1, authWindowMs: 60_000 });
  const app = express();
  app.use(express.json());
  app.post('/login', limiters.loginIpEmail, (_req, res) => res.status(200).end());
  const { server, baseUrl } = await startServer(app);
  t.after(() => server.close());

  const login = (email) => fetch(`${baseUrl}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email })
  });
  assert.equal((await login(' TEST@example.com ')).status, 200);
  assert.equal((await login('test@EXAMPLE.com')).status, 429);
  assert.equal((await login('another@example.com')).status, 200);
});
