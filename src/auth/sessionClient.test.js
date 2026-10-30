import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionClient } from './sessionClient.js';
import { canResumeAuthAction, isSessionUser, roleDestination } from './roleDestination.js';

const base = 'https://api.example.test';
const user = { id: 1, role: 'ADMIN', is_active: true };
const json = (body, status = 200) => new Response(JSON.stringify(body), { status });
const deferred = () => { let resolve; const promise = new Promise((done) => { resolve = done; }); return { promise, resolve }; };

test('roles resolve explicitly and incompatible pending actions cannot resume', () => {
  assert.equal(roleDestination('ADMIN'), '/admin');
  assert.equal(roleDestination('AGENT'), '/sale/overview');
  assert.equal(roleDestination('USER'), '/');
  assert.equal(roleDestination('OWNER'), '/login');
  assert.equal(isSessionUser({ ...user, is_active: false }), false);
  for (const role of ['ADMIN', 'AGENT', null]) {
    assert.equal(canResumeAuthAction(role, { type: 'FAVORITE_PROPERTY', propertyId: 1 }), false);
    assert.equal(canResumeAuthAction(role, { type: 'NAVIGATE', returnTo: '/profile' }), false);
  }
  assert.equal(canResumeAuthAction('USER', { type: 'NAVIGATE', returnTo: '/admin' }), false);
  assert.equal(canResumeAuthAction('AGENT', { type: 'NAVIGATE', returnTo: '/chat' }), true);
});

test('late restore cannot restore a logged out account', async () => {
  const pending = deferred();
  const client = createSessionClient({ apiBaseUrl: base, fetchImpl: () => pending.promise });
  const restore = client.restoreSession();
  client.clearAccessToken();
  pending.resolve(json({ user, accessToken: 'old-token' }));
  await assert.rejects(restore, { name: 'AbortError' });
  assert.equal(client.getAccessToken(), null);
});

test('late restore cannot overwrite an explicit new login', async () => {
  const pending = deferred();
  const client = createSessionClient({ apiBaseUrl: base, fetchImpl: () => pending.promise });
  const restore = client.restoreSession();
  client.setAccessToken('new-account-token', 2);
  pending.resolve(json({ user, accessToken: 'old-token' }));
  await assert.rejects(restore, { name: 'AbortError' });
  assert.equal(client.getAccessToken(), 'new-account-token');
});

test('an old mutation cannot be replayed as the newly logged in account', async () => {
  const pending = deferred();
  const calls = [];
  const client = createSessionClient({ apiBaseUrl: base, fetchImpl: (...args) => { calls.push(args); return pending.promise; } });
  client.setAccessToken('account-A', 1);
  const mutation = client.apiFetch(`${base}/api/favorites`, { method: 'POST' });
  client.setAccessToken('account-B', 2);
  pending.resolve(json({}, 401));
  await assert.rejects(mutation, { name: 'AbortError' });
  assert.equal(calls.length, 1);
  assert.equal(client.getAccessToken(), 'account-B');
});

test('concurrent 401 responses share one refresh and retry with the rotated token', async () => {
  let refreshes = 0;
  const headers = [];
  const client = createSessionClient({ apiBaseUrl: base, fetchImpl: async (url, options) => {
    if (url.endsWith('/refresh')) { refreshes += 1; return json({ user, accessToken: 'rotated' }); }
    const auth = options.headers.get('Authorization');
    headers.push(auth);
    return json({}, auth === 'Bearer rotated' ? 200 : 401);
  } });
  client.setAccessToken('initial', 1);
  const responses = await Promise.all([client.apiFetch(`${base}/api/one`), client.apiFetch(`${base}/api/two`)]);
  assert.deepEqual(responses.map((response) => response.status), [200, 200]);
  assert.equal(refreshes, 1);
  assert.equal(headers.filter((header) => header === 'Bearer rotated').length, 2);
});

test('cross-tab account change expires the tab without replaying its mutation', async () => {
  let expired = 0;
  let mutations = 0;
  const client = createSessionClient({ apiBaseUrl: base, onExpired: () => { expired += 1; }, fetchImpl: async (url) => {
    if (url.endsWith('/refresh')) return json({ user: { ...user, id: 2 }, accessToken: 'other-account' });
    mutations += 1;
    return json({}, 401);
  } });
  client.setAccessToken('account-A', 1);
  await assert.rejects(client.apiFetch(`${base}/api/favorites`, { method: 'POST' }), { name: 'AbortError' });
  assert.equal(mutations, 1);
  assert.equal(expired, 1);
  assert.equal(client.getAccessToken(), null);
});

test('only the exact trusted API origin and path receive bearer and cookies', async () => {
  const calls = [];
  const client = createSessionClient({ apiBaseUrl: base, fetchImpl: async (...args) => { calls.push(args); return json({}); } });
  client.setAccessToken('secret', 1);
  for (const url of ['https://other.test/api/users', `${base}.evil.test/api/users`, `${base}/not-api`, `${base}/api/../other`]) {
    await client.publicApiFetch(url);
    assert.equal(calls.at(-1)[1].credentials, undefined);
    assert.equal(calls.at(-1)[1].headers, undefined);
  }
  await client.publicApiFetch(`${base}/api/properties`);
  assert.equal(calls.at(-1)[1].headers.get('Authorization'), 'Bearer secret');
  assert.equal(calls.at(-1)[1].credentials, 'include');
});

test('refresh propagates current server role; malformed or disabled accounts expire', async () => {
  const seen = [];
  let current = { ...user, role: 'USER' };
  const client = createSessionClient({ apiBaseUrl: base, onUser: (value) => seen.push(value), fetchImpl: async () => json({ user: current, accessToken: 'new' }) });
  client.setAccessToken('initial', 1);
  await client.restoreSession();
  assert.equal(seen[0].role, 'USER');
  current = { ...current, is_active: false };
  await assert.rejects(client.restoreSession(), /không hợp lệ/);
  assert.equal(client.getAccessToken(), null);
});

test('refresh rotation is serialized across clients when a shared lock is available', async () => {
  let queue = Promise.resolve();
  const withLock = (work) => { const next = queue.then(work); queue = next.catch(() => {}); return next; };
  let active = 0;
  let maximum = 0;
  const fetchImpl = async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 10));
    active -= 1;
    return json({ user, accessToken: 'rotated' });
  };
  const clients = [1, 2].map(() => createSessionClient({ apiBaseUrl: base, fetchImpl, withLock }));
  await Promise.all(clients.map((client) => client.restoreSession()));
  assert.equal(maximum, 1);
});
