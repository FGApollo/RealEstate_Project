process.env.JWT_SECRET ||= 'favorites-route-auth-test-secret-with-32-characters';

const test = require('node:test');
const assert = require('node:assert/strict');
const favoritesRoutes = require('../routes/favoritesRoutes');
const { authenticate } = require('../middleware/authenticate');

test('guest POST to favorites is stopped by backend JWT authentication', async () => {
  assert.equal(favoritesRoutes.stack[0].handle, authenticate);
  const result = await new Promise((resolve) => {
    let statusCode;
    authenticate({ get: () => '' }, {
      status(code) { statusCode = code; return this; },
      json(body) { resolve({ statusCode, body }); }
    }, () => resolve({ passedThrough: true }));
  });
  assert.equal(result.statusCode, 401);
  assert.equal(result.passedThrough, undefined);
});
