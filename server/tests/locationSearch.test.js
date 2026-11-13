process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://isolated-search.example.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'isolated-search-service-key';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { supabase } = require('../config/supabase');
const { parseSearchFilters, normalizeLocation } = require('../services/propertySearchFilters');
const propertyRepository = require('../repositories/propertyRepository');

const listing = (id, district, ward, city = 'TP. Hồ Chí Minh') => ({ id, district, ward, city, address: `${ward}, ${district}, ${city}` });
const POOL = [
  listing(1, 'Quận 1', 'Phường Bến Nghé'),
  listing(2, 'Bình Thạnh', 'Phường Thạnh Mỹ Tây'),
  listing(3, 'Bình Thạnh', 'Phường 25'),
  listing(4, 'Quận 10', 'Phường 12'),
  listing(5, 'Ngũ Hành Sơn', 'Mỹ An', 'Đà Nẵng'),
  { id: 7, district: 'TP. Thủ Đức', ward: 'An Phú', city: 'TP. Hồ Chí Minh', address: '12 Xa lộ Hà Nội, An Phú' },
  listing(6, 'Gò Vấp', 'Phường 10')
];

test('location keywords are normalised: accents, admin prefixes, short forms and city aliases', () => {
  assert.equal(normalizeLocation('quận Bình Thạnh'), 'binh thanh');
  assert.equal(normalizeLocation('Q1'), 'quan 1');
  assert.equal(normalizeLocation('q.10'), 'quan 10');
  assert.equal(normalizeLocation('P. 25'), 'phuong 25');
  assert.equal(normalizeLocation('TP.HCM'), 'ho chi minh');
  assert.equal(normalizeLocation('TP Thủ Đức'), 'thu duc');
  assert.deepEqual(parseSearchFilters(JSON.stringify({ location: '   ' })), {});
  assert.throws(() => parseSearchFilters(JSON.stringify({ location: 'a\u0001' })), { statusCode: 400 });
});

test('location search matches whole words on ward, district, city and address, without the SQL seeing the key', async (t) => {
  const calls = [];
  t.mock.method(supabase, 'rpc', async (name, args) => { calls.push(args); return { data: POOL, error: null }; });
  const search = async (text) => (await propertyRepository.fetchPublicProperties({
    filters: parseSearchFilters(JSON.stringify({ location: text })), limit: 24
  })).map((property) => property.id);

  assert.deepEqual(await search('Bình Thạnh'), [2, 3]);
  assert.deepEqual(await search('binh thanh'), [2, 3]);
  assert.deepEqual(await search('Quận 1'), [1], '"quan 1" must not match "Quận 10"');
  assert.deepEqual(await search('q10'), [4]);
  assert.deepEqual(await search('Đà Nẵng'), [5]);
  assert.deepEqual(await search('Thạnh Mỹ Tây'), [2]);
  assert.deepEqual(await search('Hà Nội'), []);
  assert.ok(calls.every((args) => !('location' in args.p_filters) && args.p_limit === 1000));
});

test('public list pages by offset without a schema change', async (t) => {
  const calls = [];
  t.mock.method(supabase, 'rpc', async (name, args) => { calls.push(args); return { data: POOL.slice(0, args.p_limit), error: null }; });
  const page = await propertyRepository.fetchPublicProperties({ limit: 2, offset: 2 });
  assert.deepEqual(page.map((property) => property.id), [3, 4]);
  assert.equal(calls[0].p_limit, 4);
  assert.equal('p_offset' in calls[0], false);
});

test('new administrative units match listings written with old ward + district names', async (t) => {
  const pool = [
    { id: 11, city: 'TP. Hồ Chí Minh', district: 'Bình Thạnh', ward: 'Phường 26' },
    { id: 12, city: 'TP. Hồ Chí Minh', district: 'Bình Thạnh', ward: 'Phường Bình Thạnh' },
    { id: 13, city: 'TP. Hồ Chí Minh', district: 'Quận 3', ward: 'Phường 12' },
    { id: 14, city: 'Tỉnh Bình Dương', district: 'Thành phố Dĩ An', ward: 'Phường Đông Hòa' },
    { id: 15, city: 'Đà Nẵng', district: 'Ngũ Hành Sơn', ward: 'Mỹ An' }
  ];
  t.mock.method(supabase, 'rpc', async () => ({ data: pool, error: null }));
  const search = async (filters) => (await propertyRepository.fetchPublicProperties({
    filters: parseSearchFilters(JSON.stringify(filters)), limit: 24
  })).map((property) => property.id);
  const hcm = 'Thành phố Hồ Chí Minh';
  assert.deepEqual(await search({ province: hcm }), [11, 12, 13, 14], 'old Bình Dương now belongs to TP.HCM');
  assert.deepEqual(await search({ province: hcm, ward: 'Phường Bình Thạnh' }), [11, 12], 'old "Phường 26, Bình Thạnh" maps to new Phường Bình Thạnh; "Phường 12, Quận 3" does not');
  assert.deepEqual(await search({ province: 'Thành phố Đà Nẵng' }), [15]);
  assert.throws(() => parseSearchFilters(JSON.stringify({ ward: 'Phường Bình Thạnh' })), { statusCode: 400 });
});

test('old wards missing from the source mapping fall back to the new ward named after their old district', () => {
  const { matchesArea } = require('../services/adminAreas');
  const hcm = 'Thành phố Hồ Chí Minh';
  const old14 = { city: 'TP. Hồ Chí Minh', district: 'Bình Thạnh', ward: 'Phường 14' };
  assert.equal(matchesArea(old14, { province: hcm, ward: 'Phường Bình Thạnh' }), true);
  assert.equal(matchesArea(old14, { province: hcm, ward: 'Phường Gia Định' }), false);
  // Đã có trong bảng ánh xạ thì theo bảng: Phường 25 cũ thuộc Thạnh Mỹ Tây, không bị kéo sang Phường Bình Thạnh.
  const old25 = { city: 'TP. Hồ Chí Minh', district: 'Bình Thạnh', ward: 'Phường 25' };
  assert.equal(matchesArea(old25, { province: hcm, ward: 'Phường Thạnh Mỹ Tây' }), true);
  assert.equal(matchesArea(old25, { province: hcm, ward: 'Phường Bình Thạnh' }), false);
  // Quận đánh số không dùng quy tắc dự phòng.
  assert.equal(matchesArea({ city: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Không Rõ' }, { province: hcm, ward: 'Phường Sài Gòn' }), false);
});

test('each listing (old or new address) resolves to the new unit it is found under', () => {
  const { resolveNewArea, matchesArea } = require('../services/adminAreas');
  const cases = [
    [{ city: 'TP. Hồ Chí Minh', district: 'Bình Thạnh', ward: 'Phường 14' }, 'Thành phố Hồ Chí Minh', 'Phường Bình Thạnh'],
    [{ city: 'Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé' }, 'Thành phố Hồ Chí Minh', 'Phường Sài Gòn'],
    [{ city: 'Thành phố Hồ Chí Minh', ward: 'Phường Sài Gòn' }, 'Thành phố Hồ Chí Minh', 'Phường Sài Gòn'],
    [{ city: 'Bình Dương', district: 'Dĩ An', ward: 'Đông Hòa' }, 'Thành phố Hồ Chí Minh', 'Phường Đông Hòa'],
    [{ city: 'Đà Nẵng', district: 'Ngũ Hành Sơn', ward: 'Mỹ An' }, 'Thành phố Đà Nẵng', 'Phường Ngũ Hành Sơn']
  ];
  for (const [property, province, ward] of cases) {
    assert.deepEqual(resolveNewArea(property), { province, ward });
    assert.equal(matchesArea(property, { province, ward }), true);
  }
  // Tỉnh chưa có bảng ánh xạ: giữ nguyên tên đang ghi trong tin.
  assert.deepEqual(resolveNewArea({ city: 'Cần Thơ', ward: 'Ninh Kiều' }), { province: 'Cần Thơ', ward: 'Ninh Kiều' });
});

test('2025 Đặc khu normalization and geocoder removal checks', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { matchesArea } = require('../services/adminAreas');

  assert.equal(normalizeLocation('Đặc khu Côn Đảo'), 'con dao');
  assert.equal(normalizeLocation('Đặc khu Phú Quốc'), 'phu quoc');

  assert.equal(matchesArea(
    { city: 'Thành phố Hồ Chí Minh', district: '', ward: 'Đặc khu Côn Đảo' },
    { province: 'Thành phố Hồ Chí Minh', ward: 'Đặc khu Côn Đảo' }
  ), true);
  assert.equal(matchesArea(
    { city: 'An Giang', district: '', ward: 'Phú Quốc' },
    { province: 'Tỉnh An Giang', ward: 'Đặc khu Phú Quốc' }
  ), true);

  const serverRoot = path.resolve(__dirname, '..');
  assert.equal(fs.existsSync(path.join(serverRoot, 'routes', 'geocodeRoutes.js')), false);
  assert.equal(fs.existsSync(path.join(serverRoot, 'controllers', 'geocodeController.js')), false);
  assert.equal(fs.existsSync(path.join(serverRoot, 'scripts', 'backfill-coordinates.cjs')), false);
  const indexSource = fs.readFileSync(path.join(serverRoot, 'index.js'), 'utf8');
  assert.equal(indexSource.includes('/api/geocode'), false);
});

