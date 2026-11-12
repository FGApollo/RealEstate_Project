process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://isolated-reset.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'isolated-reset-service-key';
const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const emailService = require('../services/emailService');
const { hashVerificationToken } = require('../services/emailVerificationPolicy');
const passwordResetService = require('../services/passwordResetService');

const userQuery = (user) => () => {
  const chain = { select: () => chain, eq: () => chain, maybeSingle: async () => ({ data: user, error: null }) };
  return chain;
};

beforeEach((t) => {
  t.mock.method(emailService, 'assertConfigured', () => {});
});

test('unknown or disabled accounts get the same generic answer and no token', async (t) => {
  const rpc = t.mock.method(supabase, 'rpc', async () => ({ data: [{ issued: true }] }));
  const send = t.mock.method(emailService, 'sendPasswordResetEmail', async () => {});
  for (const user of [null, { id: 3, email: 'off@qa.test', is_active: false }]) {
    t.mock.method(supabase, 'from', userQuery(user));
    const result = await passwordResetService.requestPasswordReset('off@qa.test');
    assert.equal(result.message, passwordResetService.GENERIC_MESSAGE);
  }
  assert.equal(rpc.mock.callCount(), 0);
  assert.equal(send.mock.callCount(), 0);
  await assert.rejects(passwordResetService.requestPasswordReset('not-an-email'), { statusCode: 400 });
});

test('an active account gets a single-use link; only the token hash reaches the database', async (t) => {
  t.mock.method(supabase, 'from', userQuery({ id: 7, email: 'user@qa.test', is_active: true }));
  const rpc = t.mock.method(supabase, 'rpc', async () => ({ data: [{ issued: true, reason: 'ISSUED' }] }));
  let sent;
  t.mock.method(emailService, 'sendPasswordResetEmail', async (payload) => { sent = payload; });
  const result = await passwordResetService.requestPasswordReset(' User@QA.test ');
  assert.equal(result.message, passwordResetService.GENERIC_MESSAGE);
  const [name, args] = rpc.mock.calls[0].arguments;
  assert.equal(name, 'issue_password_reset_token');
  assert.equal(args.p_user_id, 7);
  assert.equal(args.p_token_hash, hashVerificationToken(sent.token));
  assert.notEqual(args.p_token_hash, sent.token);
  const ttl = new Date(args.p_expires_at).getTime() - Date.now();
  assert.ok(ttl > 29 * 60 * 1000 && ttl <= 30 * 60 * 1000);
  assert.equal(sent.email, 'user@qa.test');
  assert.equal(sent.ttlMinutes, 30);
});

test('cooldown / hourly limit answers generically without sending mail', async (t) => {
  t.mock.method(supabase, 'from', userQuery({ id: 7, email: 'user@qa.test', is_active: true }));
  t.mock.method(supabase, 'rpc', async () => ({ data: [{ issued: false, reason: 'COOLDOWN' }] }));
  const send = t.mock.method(emailService, 'sendPasswordResetEmail', async () => {});
  const result = await passwordResetService.requestPasswordReset('user@qa.test');
  assert.equal(result.message, passwordResetService.GENERIC_MESSAGE);
  assert.equal(send.mock.callCount(), 0);
});

test('reset validates token shape and password before touching the database', async (t) => {
  const rpc = t.mock.method(supabase, 'rpc', async () => ({ data: [{ reset: true }] }));
  await assert.rejects(passwordResetService.resetPassword({ token: 'short', password: 'Correct-Horse-9', confirmPassword: 'Correct-Horse-9' }),
    { statusCode: 400, code: 'RESET_TOKEN_INVALID' });
  const token = 'a'.repeat(43);
  await assert.rejects(passwordResetService.resetPassword({ token, password: 'short', confirmPassword: 'short' }), { statusCode: 400 });
  await assert.rejects(passwordResetService.resetPassword({ token, password: 'Correct-Horse-9', confirmPassword: 'Other-Horse-9' }), { statusCode: 400 });
  assert.equal(rpc.mock.callCount(), 0);
});

test('a valid link sets a bcrypt hash; a used or expired link is refused', async (t) => {
  const token = 'b'.repeat(43);
  let args;
  const rpc = t.mock.method(supabase, 'rpc', async (name, payload) => { args = payload; return { data: [{ reset: true, reason: 'RESET' }] }; });
  const result = await passwordResetService.resetPassword({ token, password: 'Correct-Horse-9', confirmPassword: 'Correct-Horse-9' });
  assert.equal(result.reset, true);
  assert.equal(rpc.mock.calls[0].arguments[0], 'consume_password_reset_token');
  assert.equal(args.p_token_hash, hashVerificationToken(token));
  assert.ok(await bcrypt.compare('Correct-Horse-9', args.p_password_hash));

  rpc.mock.mockImplementation(async () => ({ data: [{ reset: false, reason: 'EXPIRED' }] }));
  await assert.rejects(passwordResetService.resetPassword({ token, password: 'Correct-Horse-9', confirmPassword: 'Correct-Horse-9' }),
    { statusCode: 400, code: 'RESET_TOKEN_INVALID' });
});
