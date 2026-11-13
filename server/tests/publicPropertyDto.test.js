const test = require('node:test');
const assert = require('node:assert/strict');
const { toPublicProperty } = require('../services/publicPropertyDto');
const propertyService = require('../services/propertyService');
const propertyController = require('../controllers/propertyController');

test('public property DTO exposes browsing fields and strips owner contact/internal fields', () => {
  const result = toPublicProperty({
    id: 12,
    owner_id: 97,
    title: 'Căn hộ trung tâm',
    description: 'Liên hệ 0901234567 hoặc owner@example.com',
    price: 12000000,
    area: 72,
    bedrooms: 2,
    bathrooms: 2,
    property_type: 'Căn Hộ',
    listing_type: 'RENT',
    status: 'AVAILABLE',
    city: 'Hồ Chí Minh',
    district: 'Quận 7',
    ward: 'Tân Phú',
    address: 'Số 123, đường riêng tư',
    address_detail: 'Căn 5A',
    contact_phone: '0901234567',
    latitude: 10.7,
    longitude: 106.7,
    is_hidden: true,
    thumbnail: '/home.jpg',
    property_images: [{ id: 9, image_url: '/home.jpg' }],
    owner: {
      id: 97,
      name: 'Môi giới',
      role: 'AGENT',
      avatar: '/agent.jpg',
      email: 'owner@example.com',
      trust_score: 99,
      verification_status: 'VERIFIED',
      created_at: '2026-01-01'
    }
  });

  assert.equal(result.id, 12);
  assert.equal(result.address, 'Tân Phú, Quận 7, Hồ Chí Minh');
  assert.equal(result.description.includes('0901234567'), false);
  assert.equal(result.description.includes('owner@example.com'), false);
  assert.deepEqual(result.owner, { name: 'Môi giới', role: 'AGENT', avatar: '/agent.jpg', verification_status: 'VERIFIED' });
  // Trạng thái khác VERIFIED (đang chờ, bị từ chối) không bao giờ được trả ra.
  for (const status of ['PENDING', 'REJECTED', 'UNVERIFIED']) {
    const hidden = toPublicProperty({ owner: { name: 'A', role: 'AGENT', verification_status: status } });
    assert.equal(Object.hasOwn(hidden.owner, 'verification_status'), false);
  }
  assert.equal(result.latitude, 10.7);
  assert.equal(result.longitude, 106.7);
  for (const field of ['owner_id', 'contact_phone', 'address_detail', 'is_hidden']) {
    assert.equal(Object.hasOwn(result, field), false, `${field} must not be returned publicly`);
  }
  const unpinned = toPublicProperty({ id: 13, city: 'Hồ Chí Minh', ward: 'Phường Sài Gòn', latitude: null, longitude: null });
  assert.equal(unpinned.latitude, null);
  assert.equal(unpinned.longitude, null);
  const zeroCoords = toPublicProperty({ id: 14, city: 'Hồ Chí Minh', ward: 'Phường Sài Gòn', latitude: 0, longitude: 0 });
  assert.equal(zeroCoords.latitude, null);
  assert.equal(zeroCoords.longitude, null);
  assert.deepEqual(result.property_images, [{ image_url: '/home.jpg' }]);
});

test('public property list controller applies the safe DTO to service rows', async (t) => {
  const originalGetProperties = propertyService.getProperties;
  propertyService.getProperties = async () => [{
    id: 21,
    owner_id: 4,
    title: 'Nhà xem trước',
    price: 5000000,
    city: 'Hồ Chí Minh',
    district: 'Quận 3',
    ward: 'Phường 5',
    contact_phone: '0901234567',
    owner: { name: 'Agent', email: 'agent@example.com', trust_score: 12 }
  }];
  t.after(() => { propertyService.getProperties = originalGetProperties; });

  const response = {
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
  await propertyController.getProperties({ query: { limit: '12' }, user: null }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.properties[0].id, 21);
  assert.equal(Object.hasOwn(response.body.properties[0], 'contact_phone'), false);
  assert.equal(Object.hasOwn(response.body.properties[0], 'owner_id'), false);
  assert.deepEqual(response.body.properties[0].owner, { name: 'Agent', role: undefined, avatar: undefined });
});

test('public property DTO formats 2025 two-tier addresses cleanly when district is empty', () => {
  const result = toPublicProperty({
    id: 33,
    city: 'Thành phố Hồ Chí Minh',
    district: '',
    ward: 'Phường Thủ Đức'
  });
  assert.equal(result.address, 'Phường Thủ Đức, Thành phố Hồ Chí Minh');
  assert.equal(result.public_location, 'Phường Thủ Đức, Thành phố Hồ Chí Minh');
});
