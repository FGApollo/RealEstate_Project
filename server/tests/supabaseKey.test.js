const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveSupabaseServerKey } = require('../config/supabaseKey');

const jwt = (role) => `x.${Buffer.from(JSON.stringify({ role })).toString('base64url')}.y`;

test('backend accepts secret keys and prefers SUPABASE_SECRET_KEY', () => {
  assert.equal(resolveSupabaseServerKey({ SUPABASE_SECRET_KEY: 'sb_secret_a', SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_b' }), 'sb_secret_a');
  assert.equal(resolveSupabaseServerKey({ SUPABASE_SERVICE_ROLE_KEY: ' sb_secret_b ' }), 'sb_secret_b');
  assert.equal(resolveSupabaseServerKey({ SUPABASE_SERVICE_ROLE_KEY: jwt('service_role') }), jwt('service_role'));
});

test('backend refuses to start with a missing, publishable or anon key', () => {
  assert.throws(() => resolveSupabaseServerKey({}), /SUPABASE_SECRET_KEY/);
  assert.throws(() => resolveSupabaseServerKey({ SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_abc' }), /khóa công khai/);
  assert.throws(() => resolveSupabaseServerKey({ SUPABASE_SERVICE_ROLE_KEY: jwt('anon') }), /khóa công khai/);
  assert.throws(() => resolveSupabaseServerKey({ SUPABASE_SECRET_KEY: jwt('authenticated') }), /khóa công khai/);
});
