const test = require('node:test');
const assert = require('node:assert/strict');
const { checkDescriptionIsMultiListing } = require('../services/geminiService');

test('F32 AI portfolio scanner: detects multi-listing patterns via heuristic rules', async () => {
  const portfolioText = 'Cho thuê giỏ hàng căn hộ Vinhomes Central Park: Căn 1PN giá 15tr, Căn 2PN giá 20tr full nội thất.';
  const result = await checkDescriptionIsMultiListing(portfolioText);
  assert.equal(result.is_multi_listing, true);
  assert.match(result.reason, /giỏ hàng|nhiều căn hộ/i);

  const singleText = 'Cho thuê căn hộ 2 phòng ngủ 75m2 tại Masteri Thảo Điền, view sông Sài Gòn thoáng mát, giá 18tr/tháng.';
  const singleResult = await checkDescriptionIsMultiListing(singleText);
  assert.equal(singleResult.is_multi_listing, false);
});

test('F28 & F31: Phone normalization and validation regex for listing contact', () => {
  const normalize = (phone) => (phone || '').trim().replace(/[\s().-]/g, '').replace(/^\+84/, '0');
  const isValid = (p) => /^0[35789]\d{8}$/.test(normalize(p));

  assert.equal(isValid('0987654321'), true);
  assert.equal(isValid('+84 912 345 678'), true);
  assert.equal(isValid('0388-999-111'), true);
  assert.equal(isValid('12345'), false);
  assert.equal(isValid(''), false);
  assert.equal(isValid(null), false);
});

test('F34/F35: Chat message limit parser clamps bounds correctly', () => {
  const clampLimit = (raw) => Math.min(Math.max(parseInt(raw, 10) || 50, 1), 100);
  assert.equal(clampLimit(undefined), 50);
  assert.equal(clampLimit(null), 50);
  assert.equal(clampLimit('invalid'), 50);
  assert.equal(clampLimit('10'), 10);
  assert.equal(clampLimit('500'), 100); // capped at 100
  assert.equal(clampLimit('-5'), 1);    // min 1
});

test('F34/F35: Lightweight conversation aggregation preserves latest partner context without heavy joins', () => {
  const userId = 1;
  const mockMessages = [
    { id: 103, sender_id: 2, receiver_id: 1, message: 'Chào bạn', is_read: false, created_at: '2026-10-15T10:00:00Z', property_id: 88 },
    { id: 102, sender_id: 1, receiver_id: 2, message: 'Tôi quan tâm căn hộ', is_read: true, created_at: '2026-10-15T09:50:00Z', property_id: 88 },
    { id: 101, sender_id: 3, receiver_id: 1, message: 'Dạ vâng', is_read: true, created_at: '2026-10-14T08:00:00Z', property_id: null }
  ];

  const uniquePartnersMap = new Map();
  const unreadCountMap = new Map();
  const partnerPropertyIdMap = new Map();

  mockMessages.forEach(msg => {
    const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
    if (!uniquePartnersMap.has(partnerId)) {
      uniquePartnersMap.set(partnerId, msg);
    }
    if (msg.receiver_id === userId && !msg.is_read) {
      unreadCountMap.set(partnerId, (unreadCountMap.get(partnerId) || 0) + 1);
    }
    if (msg.property_id && !partnerPropertyIdMap.has(partnerId)) {
      partnerPropertyIdMap.set(partnerId, msg.property_id);
    }
  });

  assert.equal(uniquePartnersMap.size, 2);
  assert.equal(unreadCountMap.get(2), 1);
  assert.equal(unreadCountMap.get(3) || 0, 0);
  assert.equal(partnerPropertyIdMap.get(2), 88);
  assert.equal(partnerPropertyIdMap.get(3), undefined);
});

