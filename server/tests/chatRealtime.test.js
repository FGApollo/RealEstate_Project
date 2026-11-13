process.env.SUPABASE_URL = 'https://chat-realtime.example.test';
process.env.SUPABASE_SECRET_KEY = 'isolated-chat-realtime-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-chat-realtime-key';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'chat-realtime-test-secret-with-at-least-32-bytes';

const test = require('node:test');
const assert = require('node:assert/strict');
const { topicForUser, notifyUsers } = require('../services/chatRealtimeService');

test('each user gets a stable, unguessable realtime topic', () => {
  assert.match(topicForUser(7), /^chat:[0-9a-f]{32}$/);
  assert.equal(topicForUser(7), topicForUser('7'));
  assert.notEqual(topicForUser(7), topicForUser(8));
  assert.ok(!topicForUser(7).includes('7:'));
});

test('broadcast sends one signal per distinct user and never includes message text', async () => {
  const calls = [];
  const sent = await notifyUsers([7, 8, 7, 'x', -1], 'new_message', { partnerIds: [7, 8], messageId: 3 }, {
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 202 }; }
  });
  assert.equal(sent, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://chat-realtime.example.test/realtime/v1/api/broadcast');
  assert.equal(calls[0].options.headers.apikey, 'isolated-chat-realtime-key');
  const body = JSON.parse(calls[0].options.body);
  assert.deepEqual(body.messages.map((message) => message.topic), [topicForUser(7), topicForUser(8)]);
  assert.deepEqual(body.messages[0].payload, { partnerIds: [7, 8], messageId: 3 });
});

test('a failed or unreachable broadcast is reported as false and never throws', async (t) => {
  t.mock.method(console, 'warn', () => {});
  assert.equal(await notifyUsers([7], 'new_message', {}, { fetchImpl: async () => ({ ok: false, status: 500 }) }), false);
  assert.equal(await notifyUsers([7], 'new_message', {}, { fetchImpl: async () => { throw new Error('network down'); } }), false);
  assert.equal(await notifyUsers([], 'new_message', {}), false);
});
