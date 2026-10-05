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
  assert.deepEqual(result.owner, { name: 'Môi giới', role: 'AGENT', avatar: '/agent.jpg' });
  for (const field of ['owner_id', 'contact_phone', 'address_detail', 'latitude', 'longitude', 'is_hidden']) {
    assert.equal(Object.hasOwn(result, field), false, `${field} must not be returned publicly`);
  }
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
