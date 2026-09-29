const test = require('node:test');
const assert = require('node:assert/strict');
const userProfileRoutes = require('../routes/userProfileRoutes');
const { validatePassword, normalizeVietnamPhone } = require('../services/registrationValidation');

test('userProfileRoutes registers all expected profile endpoints', () => {
  const routes = userProfileRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => ({
      path: layer.route.path,
      methods: Object.keys(layer.route.methods)
    }));

  assert.ok(
    routes.some((r) => r.path === '/profile' && r.methods.includes('get')),
    'GET /profile must be registered'
  );
  assert.ok(
    routes.some((r) => r.path === '/profile' && r.methods.includes('put')),
    'PUT /profile must be registered'
  );
  assert.ok(
    routes.some((r) => r.path === '/password' && r.methods.includes('put')),
    'PUT /password must be registered'
  );
  assert.ok(
    routes.some((r) => r.path === '/avatar' && r.methods.includes('post')),
    'POST /avatar must be registered'
  );
});

test('user profile validation: name length and Vietnamese phone normalization', () => {
  // Vietnamese phone format
  assert.equal(normalizeVietnamPhone('0912345678'), '0912345678');
  assert.equal(normalizeVietnamPhone('+84912345678'), '0912345678');
  assert.equal(normalizeVietnamPhone('0389998888'), '0389998888');
  assert.equal(normalizeVietnamPhone('0589998888'), '0589998888');
  assert.equal(normalizeVietnamPhone('0789998888'), '0789998888');
  assert.equal(normalizeVietnamPhone('0889998888'), '0889998888');
  // Invalid numbers
  assert.equal(normalizeVietnamPhone('0123456789'), null);
  assert.equal(normalizeVietnamPhone('12345'), null);
  assert.equal(normalizeVietnamPhone('091234567890'), null);
});

test('password validation for change password', () => {
  // Valid passwords
  assert.equal(validatePassword('SuperSecurePassword2026!'), null);
  assert.equal(validatePassword('NhaDepQuan1!@#'), null);

  // Too short (< 10 chars)
  assert.notEqual(validatePassword('Short1!'), null);

  // Common passwords
  assert.notEqual(validatePassword('password123456'), null);
  assert.notEqual(validatePassword('swipenest123456'), null);

  // Whitespace only
  assert.notEqual(validatePassword('          '), null);
});
