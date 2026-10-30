process.env.SUPABASE_URL = 'https://auth-security-tests.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-auth-security-key';
process.env.JWT_SECRET = 'isolated-auth-security-secret-over-32-characters';
process.env.CORS_ALLOWED_ORIGINS = 'https://app.example.test';
process.env.AUTH_IP_RATE_LIMIT_MAX = '1000';
process.env.AUTH_SESSION_IP_RATE_LIMIT_MAX = '1000';
process.env.LOGIN_IP_EMAIL_RATE_LIMIT_MAX = '1000';
process.env.GOOGLE_LOGIN_IP_RATE_LIMIT_MAX = '1000';

const { test, before, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const sessionService = require('../services/authSessionService');
const googleIdentityService = require('../services/googleIdentityService');
const { authenticate, optionalAuthenticate, requireRole } = require('../middleware/authenticate');
const authRoutes = require('../routes/authRoutes');

const origin = 'https://app.example.test';
const password = 'ExistingPassword2026!';
let passwordHash;
let tables;
let requests;
let server;
let base;
let originalFrom;
let originalGoogle;

// Every auth read/write uses this private fixture. No configured database is
// contacted, no production credentials are used, and sessions never leave RAM.
function fixtureFrom(table) {
  assert.ok(Object.hasOwn(tables, table), `Unexpected auth fixture table ${table}`);
  requests.push(table);
  let operation = 'select';
  let columns = '*';
  let payload;
  const predicates = [];
  const project = (row) => columns === '*' ? { ...row } : Object.fromEntries(
    columns.split(',').map((column) => column.trim()).filter((column) => Object.hasOwn(row, column))
      .map((column) => [column, row[column]])
  );
  const execute = () => {
    let rows = tables[table].filter((row) => predicates.every((predicate) => predicate(row)));
    if (operation === 'insert') {
      rows = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
        id: table === 'auth_sessions' ? crypto.randomUUID() : tables[table].length + 1,
        is_active: true, revoked_at: null, ...row
      }));
      tables[table].push(...rows);
    } else if (operation === 'update') rows.forEach((row) => Object.assign(row, payload));
    return { data: rows.map(project), error: null };
  };
  const builder = {
    select(value = '*') { columns = value; return builder; },
    insert(value) { operation = 'insert'; payload = value; return builder; },
    update(value) { operation = 'update'; payload = value; return builder; },
    eq(column, value) { predicates.push((row) => String(row[column]) === String(value)); return builder; },
    is(column, value) { predicates.push((row) => (row[column] ?? null) === value); return builder; },
    gt(column, value) { predicates.push((row) => Date.parse(row[column]) > Date.parse(value)); return builder; },
    async maybeSingle() { const result = execute(); return { ...result, data: result.data[0] || null }; },
    async single() { const result = execute(); return { ...result, data: result.data[0] || null }; },
    then(resolve, reject) { return Promise.resolve().then(execute).then(resolve, reject); }
  };
  return builder;
}

before(async () => {
  passwordHash = await bcrypt.hash(password, 4);
  originalFrom = supabase.from;
  originalGoogle = googleIdentityService.verifyGoogleIdentity;
  supabase.from = fixtureFrom;
  googleIdentityService.verifyGoogleIdentity = async () => ({
    subject: 'verified-google-subject', email: 'admin@example.test',
    authoritativeEmail: true, name: 'Admin'
  });
  const app = express();
  app.use(express.json());
  app.use('/api', authRoutes);
  app.get('/private', authenticate, (req, res) => res.json({ user: req.user }));
  app.get('/admin', authenticate, requireRole('ADMIN'), (req, res) => res.json({ ok: true }));
  app.get('/optional', optionalAuthenticate, (req, res) => res.json({ user: req.user || null }));
  app.use((error, req, res, next) => res.status(error.status || 500).json({ error: 'Request failed' }));
  server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(() => {
  tables = {
    users: [{ id: 1, name: 'Admin', email: 'admin@example.test', password: passwordHash,
      role: 'ADMIN', is_active: true, email_verified_at: '2026-01-01T00:00:00Z' }],
    auth_sessions: [], google_identities: []
  };
  requests = [];
});

after(async () => {
  supabase.from = originalFrom;
  googleIdentityService.verifyGoogleIdentity = originalGoogle;
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function post(path, body, headers = {}) {
  return fetch(`${base}/api${path}`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function session() {
  return sessionService.createSession({ id: 1 });
}

function headersFor(accessToken) { return { Authorization: `Bearer ${accessToken}` }; }
function refreshCookie(refreshToken) { return `swipenest_refresh=${refreshToken}`; }

test('HTTP login creates a server verified ADMIN session without credential leakage or caching', async () => {
  const response = await post('/login', { email: 'ADMIN@example.test', password });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.user.role, 'ADMIN');
  assert.equal(body.user.password, undefined);
  assert.equal(body.refreshToken, undefined);
  const cookie = response.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /Path=\/api\/auth/i);
  assert.match(cookie, /SameSite=Lax/i);
  assert.notEqual(tables.auth_sessions[0].refresh_token_hash, cookie.split('=')[1].split(';')[0]);
  assert.equal((await fetch(`${base}/admin`, { headers: headersFor(body.accessToken) })).status, 200);
  const me = await fetch(`${base}/api/auth/me`, { headers: headersFor(body.accessToken) });
  assert.equal(me.status, 200);
  assert.equal(me.headers.get('cache-control'), 'no-store');
});

test('HTTP login refuses role injection, malformed types and bcrypt truncation inputs before DB access', async () => {
  for (const body of [[], { email: {}, password }, { email: 'admin@example.test', password: {} },
    { email: 'admin@example.test', password: 'é'.repeat(37) },
    { email: 'admin@example.test', password, role: 'ADMIN' }]) {
    assert.equal((await post('/login', body)).status, 400);
  }
  assert.equal(requests.length, 0);
});

test('HTTP Google login rejects malformed bodies and oversized linking passwords before identity/DB operations', async () => {
  for (const body of [[], 'token', { credential: {} }, { credential: 'token', linkPassword: {} },
    { credential: 'token', linkPassword: 'x'.repeat(73) }, { credential: 'token', role: 'ADMIN' }]) {
    assert.equal((await post('/google-login', body)).status, 400);
  }
  assert.equal(requests.length, 0);
});

test('disabled, unknown-status and unknown-role accounts cannot sign in with password or Google', async () => {
  for (const changes of [{ is_active: false }, { is_active: null }, { is_active: undefined },
    { is_active: true, role: 'OWNER' }]) {
    Object.assign(tables.users[0], { role: 'ADMIN', ...changes });
    assert.equal((await post('/login', { email: 'admin@example.test', password })).status, 403);
    assert.equal((await post('/google-login', { credential: 'verified-token' })).status, 403);
  }
  assert.equal(tables.auth_sessions.length, 0);
  assert.equal(tables.google_identities.length, 0);
});

test('session creation re-reads account state rather than trusting caller role/status', async () => {
  tables.users[0].is_active = false;
  await assert.rejects(sessionService.createSession({ id: 1, role: 'ADMIN', is_active: true,
    email_verified_at: '2026-01-01' }), (error) => error.code === 'ACCOUNT_DISABLED');
  assert.equal(tables.auth_sessions.length, 0);
});

test('a delayed old-password login cannot create a session after the password changes', async () => {
  const authService = require('../services/authService');
  const authenticated = await authService.loginUser({ email: 'admin@example.test', password });
  assert.equal(JSON.stringify(authenticated).includes(passwordHash), false);
  tables.users[0].password = 'changed-hash';
  await assert.rejects(sessionService.createSession(authenticated), { statusCode: 401 });
  assert.equal(tables.auth_sessions.length, 0);
});

test('a password changed during session insertion revokes that newly created session', async () => {
  const authService = require('../services/authService');
  const authenticated = await authService.loginUser({ email: 'admin@example.test', password });
  const original = supabase.from;
  let passwordReads = 0;
  supabase.from = (table) => {
    if (table === 'users' && ++passwordReads === 3) tables.users[0].password = 'changed-during-insert';
    return fixtureFrom(table);
  };
  try {
    await assert.rejects(sessionService.createSession(authenticated), { statusCode: 401 });
    assert.equal(tables.auth_sessions.length, 1);
    assert.ok(tables.auth_sessions[0].revoked_at);
  } finally { supabase.from = original; }
});

test('HTTP access stops immediately when account is disabled, role changes or session is revoked', async () => {
  const { accessToken } = await session();
  const headers = headersFor(accessToken);
  tables.users[0].is_active = false;
  assert.equal((await fetch(`${base}/private`, { headers })).status, 403);
  tables.users[0].is_active = null;
  assert.equal((await fetch(`${base}/private`, { headers })).status, 403);
  tables.users[0].is_active = true;
  tables.users[0].role = 'USER';
  assert.equal((await fetch(`${base}/admin`, { headers })).status, 403);
  assert.equal((await fetch(`${base}/private`, { headers })).status, 200);
  tables.auth_sessions[0].revoked_at = new Date().toISOString();
  assert.equal((await fetch(`${base}/private`, { headers })).status, 401);
});

test('authenticated profile lookup accepts only positive integer ids and returns the public projection', async () => {
  const { accessToken } = await session();
  const headers = headersFor(accessToken);
  for (const id of ['0', '-1', '1.5', 'NaN', '9007199254740992']) {
    assert.equal((await fetch(`${base}/api/user/${id}`, { headers })).status, 400);
  }
  const response = await fetch(`${base}/api/user/1`, { headers });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).user, { id: 1, name: 'Admin', role: 'ADMIN' });
});

test('HTTP access fails closed for expired/malformed/missing session dates and mismatched token owner', async () => {
  const { accessToken } = await session();
  const headers = headersFor(accessToken);
  for (const expiresAt of [null, undefined, 'invalid-date', '2000-01-01T00:00:00Z']) {
    tables.auth_sessions[0].expires_at = expiresAt;
    assert.equal((await fetch(`${base}/private`, { headers })).status, 401);
  }
  tables.auth_sessions[0].expires_at = new Date(Date.now() + 60000).toISOString();
  tables.auth_sessions[0].user_id = 2;
  assert.equal((await fetch(`${base}/private`, { headers })).status, 401);
});

test('HTTP optional authentication never attaches disabled or unverified accounts', async () => {
  const { accessToken } = await session();
  for (const changes of [{ is_active: false }, { is_active: true, email_verified_at: null }]) {
    Object.assign(tables.users[0], changes);
    const response = await fetch(`${base}/optional`, { headers: headersFor(accessToken) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).user, null);
  }
});

test('HTTP refresh rotates once, rejects reused cookies and reads the current role from DB', async () => {
  const { refreshToken } = await session();
  tables.users[0].role = 'USER';
  const response = await post('/auth/refresh', undefined, { Cookie: refreshCookie(refreshToken) });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.user.role, 'USER');
  assert.equal(body.user.password, undefined);
  assert.notEqual(response.headers.get('set-cookie').split(';')[0], refreshCookie(refreshToken));
  const reused = await post('/auth/refresh', undefined, { Cookie: refreshCookie(refreshToken) });
  assert.equal(reused.status, 401);
  assert.equal(reused.headers.get('set-cookie'), null);
});

test('concurrent refresh uses a compare-and-swap so only one request can rotate a token', async () => {
  const { refreshToken } = await session();
  const results = await Promise.all([sessionService.refreshSession(refreshToken), sessionService.refreshSession(refreshToken)]);
  assert.equal(results.filter(Boolean).length, 1);
});

test('a stale refresh response cannot delete the cookie rotated successfully by another tab', async () => {
  const { refreshToken } = await session();
  const responses = await Promise.all([
    post('/auth/refresh', undefined, { Cookie: refreshCookie(refreshToken) }),
    post('/auth/refresh', undefined, { Cookie: refreshCookie(refreshToken) })
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [200, 401]);
  const succeeded = responses.find((response) => response.status === 200);
  const stale = responses.find((response) => response.status === 401);
  assert.ok(succeeded.headers.get('set-cookie'));
  assert.equal(stale.headers.get('set-cookie'), null);
});

test('refresh refuses disabled, unverified, revoked, expired or unknown-role accounts', async () => {
  const { refreshToken } = await session();
  for (const changes of [{ is_active: false }, { is_active: null }, { is_active: true, role: 'OWNER' },
    { is_active: true, role: 'ADMIN', email_verified_at: null }]) {
    Object.assign(tables.users[0], changes);
    assert.equal(await sessionService.refreshSession(refreshToken), null);
  }
  Object.assign(tables.users[0], { is_active: true, role: 'ADMIN', email_verified_at: '2026-01-01' });
  tables.auth_sessions[0].revoked_at = new Date().toISOString();
  assert.equal(await sessionService.refreshSession(refreshToken), null);
  tables.auth_sessions[0].revoked_at = null;
  tables.auth_sessions[0].expires_at = 'invalid-date';
  assert.equal(await sessionService.refreshSession(refreshToken), null);
});

test('malformed refresh cookies are rejected before database reads', async () => {
  for (const token of [undefined, {}, 'short', 'a'.repeat(10000), '%invalid']) {
    assert.equal(await sessionService.refreshSession(token), null);
  }
  assert.equal(requests.length, 0);
});

test('HTTP logout revokes bearer session even if a cookie is absent or was already rotated', async () => {
  const first = await session();
  const rotated = await sessionService.refreshSession(first.refreshToken);
  assert.ok(rotated);
  const response = await post('/auth/logout', undefined, {
    ...headersFor(first.accessToken), Cookie: refreshCookie(first.refreshToken)
  });
  assert.equal(response.status, 204);
  assert.equal((await fetch(`${base}/private`, { headers: headersFor(rotated.accessToken) })).status, 401);
  assert.equal(await sessionService.refreshSession(rotated.refreshToken), null);
  const next = await session();
  assert.equal((await post('/auth/logout', undefined, headersFor(next.accessToken))).status, 204);
  assert.equal((await fetch(`${base}/private`, { headers: headersFor(next.accessToken) })).status, 401);
});

test('HTTP cookie logout still works with malformed/expired bearer and never revokes another user', async () => {
  const created = await session();
  const { secret, issuer, audience } = sessionService.getJwtConfig();
  const expired = jwt.sign({ token_use: 'access', sid: tables.auth_sessions[0].id }, secret,
    { subject: '1', issuer, audience, expiresIn: -1 });
  assert.equal((await post('/auth/logout', undefined, { ...headersFor(expired),
    Cookie: refreshCookie(created.refreshToken) })).status, 204);
  assert.ok(tables.auth_sessions[0].revoked_at);
  const next = await session();
  assert.equal((await post('/auth/logout', undefined, headersFor('malformed-token'))).status, 204);
  assert.equal(tables.auth_sessions[1].revoked_at, null);
  assert.equal((await fetch(`${base}/private`, { headers: headersFor(next.accessToken) })).status, 200);
});

test('password-change session revocation invalidates every session for only the target account', async () => {
  const first = await session();
  const second = await session();
  tables.auth_sessions.push({ id: crypto.randomUUID(), user_id: 2, revoked_at: null });
  await sessionService.revokeAllUserSessions(1);
  for (const created of [first, second]) {
    assert.equal((await fetch(`${base}/private`, { headers: headersFor(created.accessToken) })).status, 401);
    assert.equal(await sessionService.refreshSession(created.refreshToken), null);
  }
  assert.equal(tables.auth_sessions[2].revoked_at, null);
});

test('HTTP cookie endpoints reject untrusted, opaque and missing Origin requests', async () => {
  const { refreshToken } = await session();
  for (const requestOrigin of ['https://evil.example', 'null']) {
    assert.equal((await post('/auth/refresh', undefined, {
      Origin: requestOrigin, Cookie: refreshCookie(refreshToken)
    })).status, 403);
  }
  const withoutOrigin = await fetch(`${base}/api/auth/refresh`, {
    method: 'POST', headers: { Cookie: refreshCookie(refreshToken) }
  });
  assert.equal(withoutOrigin.status, 403);
  const withoutOriginCrossSite = await fetch(`${base}/api/login`, {
    method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site', 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.test', password })
  });
  assert.equal(withoutOriginCrossSite.status, 403);
  assert.equal((await post('/auth/refresh', undefined, { Cookie: refreshCookie(refreshToken) })).status, 200);
});

test('access-token validation rejects tampering, refresh use, missing expiry, wrong owner claims and future tokens', async () => {
  const created = await session();
  const { secret, issuer, audience } = sessionService.getJwtConfig();
  const sign = (claims, options = {}) => jwt.sign(claims, secret,
    { subject: '1', issuer, audience, ...options });
  for (const token of [`${created.accessToken}tampered`,
    sign({ token_use: 'refresh', sid: tables.auth_sessions[0].id }, { expiresIn: 60 }),
    sign({ token_use: 'access', sid: tables.auth_sessions[0].id }),
    sign({ token_use: 'access', sid: 'invalid' }, { expiresIn: 60 }),
    sign({ token_use: 'access', sid: tables.auth_sessions[0].id }, { expiresIn: 60, subject: '0' }),
    sign({ token_use: 'access', sid: tables.auth_sessions[0].id }, { expiresIn: 60, notBefore: 60 })]) {
    assert.equal((await fetch(`${base}/private`, { headers: headersFor(token) })).status, 401);
  }
});
