const test = require('node:test');
const assert = require('node:assert/strict');
const geocodeController = require('../controllers/geocodeController');
const geocodeRoutes = require('../routes/geocodeRoutes');

const makeResponse = () => ({
  statusCode: null,
  body: null,
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(body) {
    this.body = body;
    return this;
  }
});

test('geocodeRoutes registers /search and /reverse endpoints', () => {
  const paths = geocodeRoutes.stack
    .filter((layer) => layer.route)
    .map((layer) => layer.route.path);

  assert.ok(paths.includes('/search'), 'Route /search should exist');
  assert.ok(paths.includes('/reverse'), 'Route /reverse should exist');
});

test('geocodeController.searchAddress returns empty array when query is empty', async () => {
  const req = { query: { q: '' } };
  const res = makeResponse();

  await geocodeController.searchAddress(req, res);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
});

test('geocodeController.reverseGeocode returns 400 when coordinates are invalid', async () => {
  const req = { query: { lat: 'abc', lon: 'xyz' } };
  const res = makeResponse();

  await geocodeController.reverseGeocode(req, res);

  assert.equal(res.statusCode, 400);
  assert.ok(res.body.error);
});
