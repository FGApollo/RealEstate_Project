process.env.SUPABASE_URL = 'https://security-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'isolated-business-security-test-key';
process.env.JWT_SECRET ||= 'isolated-business-security-test-jwt-secret';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const profileService = require('../services/userProfileService');
const propertyService = require('../services/propertyService');
const favoritesService = require('../services/favoritesService');
const favoritesController = require('../controllers/favoritesController');
const reviewService = require('../services/reviewService');
const chatService = require('../services/chatService');
const chatController = require('../controllers/chatController');
const appealService = require('../services/appealService');
const trustScoreService = require('../services/trustScoreService');
const { savePublicImage, deleteOwnedListingImage } = require('../services/publicImageStorage');
const { positiveId, propertyInput } = require('../services/businessValidation');

const mockQueries = (t, responses) => {
  const original = supabase.from;
  const calls = [];
  supabase.from = (table) => {
    const response = responses.shift();
    assert.ok(response, `Unexpected database query: ${table}`);
    assert.equal(table, response.table);
    const call = { table, methods: [] };
    calls.push(call);
    const query = new Proxy({}, { get(_target, key) {
      if (key === 'then') return (resolve, reject) => Promise.resolve(response.result).then(resolve, reject);
      return (...args) => { call.methods.push([key, ...args]); return query; };
    } });
    return query;
  };
  t.after(() => { supabase.from = original; });
  return calls;
};

const response = () => ({ status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });

test('a failed or missing trust-score RPC cannot mark a pending violation resolved', async (t) => {
  const calls = mockQueries(t, [
    { table: 'property_reports', result: { data: { id: 7, property_id: 4, reason: 'WRONG_PRICE', status: 'PENDING' } } },
    { table: 'trust_score_logs', result: { data: null } },
    { table: 'properties', result: { data: { id: 4, owner_id: 9 } } }
  ]);
  const original = supabase.rpc;
  supabase.rpc = async () => ({ error: { message: 'missing migration/private SQL details' } });
  t.after(() => { supabase.rpc = original; });
  await assert.rejects(trustScoreService.applyReportPenalty(7, 1), { statusCode: 503 });
  assert.equal(calls.some((call) => call.methods.some(([method]) => method === 'update')), false);
});

test('profile HTTP errors hide database details but preserve validated user errors', async (t) => {
  const controller = require('../controllers/userProfileController');
  mockQueries(t, [{ table: 'users', result: { error: { message: 'private SQL/schema credential detail' } } }]);
  const res = response();
  await controller.getProfile({ user: { id: 1 } }, res);
  assert.equal(JSON.stringify(res.body).includes('private'), false);
  const { safeErrorMessage } = require('../services/httpError');
  assert.equal(safeErrorMessage(Object.assign(new Error('Tên không hợp lệ'), { statusCode: 400 })), 'Tên không hợp lệ');
});

test('IDs reject coercion tricks, malformed PostgREST filters and unsafe numeric values', () => {
  for (const value of [true, [], {}, '1,receiver_id.gt.0', '1foo', '1e2', '01', 'Infinity', -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => positiveId(value), { statusCode: 400 });
  }
  assert.equal(positiveId('15'), 15);
});

test('changing the phone clears verification, while saving the same normalized phone preserves it', async (t) => {
  const calls = mockQueries(t, [
    { table: 'users', result: { data: { id: 1, phone: '0912345678' } } },
    { table: 'users', result: { data: { id: 1, phone: '0987654321', phone_verified: false } } },
    { table: 'users', result: { data: { id: 1, phone: '0912345678' } } },
    { table: 'users', result: { data: { id: 1, phone: '0912345678', phone_verified: true } } }
  ]);
  await profileService.updateUserProfile(1, { phone: '0987654321' });
  assert.deepEqual(calls[1].methods.find(([method]) => method === 'update')[1], {
    updated_at: calls[1].methods.find(([method]) => method === 'update')[1].updated_at,
    phone: '0987654321', phone_verified: false, phone_verified_at: null
  });
  await profileService.updateUserProfile(1, { phone: '+84912345678' });
  assert.equal(calls[3].methods.find(([method]) => method === 'update')[1].phone_verified, undefined);
  for (const call of [calls[1], calls[3]]) assert.ok(call.methods.some(([method, key, value]) => method === 'eq' && key === 'phone' && value === '0912345678'));
});

test('password changes verify old credential and revoke all sessions around the credential write', async (t) => {
  const calls = mockQueries(t, [
    { table: 'users', result: { data: { id: 1, password: bcrypt.hashSync('OldPassword123!', 4) } } },
    { table: 'auth_sessions', result: {} },
    { table: 'users', result: {} },
    { table: 'auth_sessions', result: {} }
  ]);
  const result = await profileService.changeUserPassword(1, { currentPassword: 'OldPassword123!', newPassword: 'NewPassword2026!' });
  assert.equal(result.requiresLogin, true);
  const update = calls[2].methods.find(([method]) => method === 'update')[1];
  assert.ok(await bcrypt.compare('NewPassword2026!', update.password));
  for (const call of [calls[1], calls[3]]) assert.ok(call.methods.some(([method, key, value]) => method === 'eq' && key === 'user_id' && value === 1));
});

test('password changes fail closed when session revocation fails', async (t) => {
  const calls = mockQueries(t, [
    { table: 'users', result: { data: { id: 1, password: bcrypt.hashSync('OldPassword123!', 4) } } },
    { table: 'auth_sessions', result: { error: { message: 'revocation unavailable' } } }
  ]);
  await assert.rejects(profileService.changeUserPassword(1, { currentPassword: 'OldPassword123!', newPassword: 'NewPassword2026!' }));
  assert.equal(calls.some((call) => call.table === 'users' && call.methods.some(([method]) => method === 'update')), false);
});

test('listing updates reject another owner before writes and reject unsafe link/numeric fields', async (t) => {
  const calls = mockQueries(t, [{ table: 'properties', result: { data: { owner_id: 2 } } }]);
  await assert.rejects(propertyService.updateProperty(8, 1, { title: 'Changed listing' }), { statusCode: 403 });
  assert.equal(calls.length, 1);
  assert.throws(() => propertyInput({ virtual_tour_url: 'javascript:alert(1)' }, { partial: true }), { statusCode: 400 });
  assert.throws(() => propertyInput({ price: '10oops' }, { partial: true }), { statusCode: 400 });
  assert.throws(() => propertyInput({ features: new Array(51).fill('x') }, { partial: true }), { statusCode: 400 });
});

test('favorites response uses public DTO and cannot disclose exact address or owner contact', async (t) => {
  const original = favoritesService.getFavorites;
  favoritesService.getFavorites = async () => [{ id: 4, favorite_id: 8, owner_id: 22,
    address: 'Secret exact address', address_detail: 'Secret apartment', contact_phone: '0901234567', city: 'HCM',
    owner: { name: 'Agent', email: 'private@example.test', phone: '0901234567' } }];
  t.after(() => { favoritesService.getFavorites = original; });
  const res = response();
  await favoritesController.getFavorites({ user: { id: 1 } }, res);
  assert.equal(res.body.favorites[0].favorite_id, 8);
  assert.equal(res.body.favorites[0].address, 'HCM');
  assert.equal(res.body.favorites[0].owner.email, undefined);
  assert.equal(res.body.favorites[0].contact_phone, undefined);
  assert.equal(res.body.favorites[0].owner_id, undefined);
});

test('hidden listings cannot be newly favorited', async (t) => {
  const calls = mockQueries(t, [{ table: 'properties', result: { data: { id: 4, status: 'AVAILABLE', is_hidden: true } } }]);
  await assert.rejects(favoritesService.addFavorite(1, 4), { statusCode: 404 });
  assert.equal(calls.length, 1);
});

test('public reviews expose aggregate helpful counts without exposing voter identities', async (t) => {
  mockQueries(t, [{ table: 'property_reviews', result: { data: [{ id: 2, helpful_votes: [{ id: 7, user_id: 10 }, { id: 8, user_id: 11 }] }] } }]);
  const [review] = await reviewService.getPropertyReviews(4, 10);
  assert.equal(review.helpful_count, 2);
  assert.equal(review.user_has_voted, true);
  assert.equal(review.helpful_votes, undefined);
});

test('review ratings and image counts are checked before database access', async (t) => {
  mockQueries(t, []);
  for (const rating of [0, 6, 3.5, true, '3oops']) {
    await assert.rejects(reviewService.createPropertyReview(1, 2, rating, ''), { statusCode: 400 });
  }
  await assert.rejects(reviewService.createPropertyReview(1, 2, 5, '', new Array(6).fill('x')), { statusCode: 400 });
});

test('hidden or moderated reviews cannot receive replies or helpful votes', async (t) => {
  mockQueries(t, [
    { table: 'property_reviews', result: { data: { id: 1, status: 'HIDDEN', property: { status: 'AVAILABLE', is_hidden: false } } } },
    { table: 'property_reviews', result: { data: { id: 1, status: 'APPROVED', property: { status: 'AVAILABLE', is_hidden: true } } } }
  ]);
  await assert.rejects(reviewService.createReviewReply(1, 2, 'Reply'), { statusCode: 404 });
  await assert.rejects(reviewService.toggleReviewHelpful(1, 2), { statusCode: 404 });
});

test('chat message reads constrain both participants and cap latest-message pages', async (t) => {
  const calls = mockQueries(t, [{ table: 'messages', result: { data: [{ id: 2 }, { id: 1 }] } }]);
  assert.deepEqual(await chatService.getMessages(10, '11'), [{ id: 1 }, { id: 2 }]);
  assert.ok(calls[0].methods.some(([method, value]) => method === 'or' && value === 'and(sender_id.eq.10,receiver_id.eq.11),and(sender_id.eq.11,receiver_id.eq.10)'));
  assert.ok(calls[0].methods.some(([method, start, end]) => method === 'range' && start === 0 && end === 199));
  await assert.rejects(chatService.getMessages(10, '11', { limit: Infinity }), { statusCode: 400 });
});

test('chat rejects attaching another conversation property before inserting any message', async (t) => {
  const calls = mockQueries(t, [
    { table: 'users', result: { data: { id: 11, is_active: true } } },
    { table: 'properties', result: { data: { id: 3, owner_id: 12, status: 'AVAILABLE', is_hidden: false } } }
  ]);
  await assert.rejects(chatService.sendMessage(10, 11, 3, 'hello'), { statusCode: 404 });
  assert.equal(calls.some((call) => call.table === 'messages'), false);
});

test('chat hides database error details from the HTTP response', async (t) => {
  mockQueries(t, [{ table: 'messages', result: { error: { message: 'private schema/SQL details' } } }]);
  const res = response();
  await chatController.getMessages({ user: { id: 10 }, query: { otherId: '11' } }, res);
  assert.equal(res.code, 500);
  assert.equal(JSON.stringify(res.body).includes('schema'), false);
});

test('merged chat supports image-only messages using validated storage and explicit null property context', async (t) => {
  const sharp = require('sharp');
  const image = await sharp({ create: { width: 2, height: 2, channels: 3, background: 'blue' } }).png().toBuffer();
  const calls = mockQueries(t, [
    { table: 'users', result: { data: { id: 11, is_active: true } } },
    { table: 'messages', result: { data: { id: 7, message: '' } } },
    { table: 'users', result: { data: [] } }
  ]);
  const uploads = [];
  t.mock.method(supabase.storage, 'from', (bucket) => {
    assert.equal(bucket, 'property-images');
    return {
      async upload(path, buffer, options) { uploads.push({ path, buffer, options }); return {}; },
      getPublicUrl(path) { return { data: { publicUrl: `https://images.example.test/${path}` } }; }
    };
  });
  await chatService.sendMessage(10, 11, null, '', [{ url: `data:image/png;base64,${image.toString('base64')}`, name: 'photo.png' }]);
  const inserted = calls[1].methods.find(([method]) => method === 'insert')[1][0];
  assert.equal(inserted.message, '');
  assert.equal(inserted.property_id, null);
  assert.equal(inserted.attachments[0].name, 'photo.png');
  assert.match(inserted.attachments[0].url, /^https:\/\/images\.example\.test\/chat\/10\/chat-10-/);
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].options.contentType, 'image/png');
});

test('merged chat rejects malformed attachments, unsafe IDs and empty messages before database access', async (t) => {
  mockQueries(t, []);
  for (const attachments of [{}, Array(6).fill({}), [{ url: 'javascript:alert(1)' }], [{ url: 'data:image/svg+xml;base64,PHN2Zz4=' }]]) {
    await assert.rejects(chatService.sendMessage(10, 11, null, '', attachments), { statusCode: 400 });
  }
  await assert.rejects(chatService.sendMessage(10, '11oops', null, 'hello'), { statusCode: 400 });
  await assert.rejects(chatService.sendMessage(10, 11, null, ''), { statusCode: 400 });
  await assert.rejects(chatService.markMessagesAsRead(10, '11,receiver_id.gt.0'), { statusCode: 400 });
});

test('merged chat rejects corrupt image data without storing a message', async (t) => {
  const calls = mockQueries(t, [{ table: 'users', result: { data: { id: 11, is_active: true } } }]);
  await assert.rejects(chatService.sendMessage(10, 11, null, '', [{ url: 'data:image/png;base64,bm90LWEtcG5n' }]), { statusCode: 400 });
  assert.equal(calls.length, 1);
});

test('read receipts update only unread messages sent by the partner to the current user', async (t) => {
  const calls = mockQueries(t, [{ table: 'messages', result: { data: [{ id: 1 }] } }]);
  const result = await chatService.markMessagesAsRead(10, '11');
  assert.equal(result.updatedCount, 1);
  for (const [key, value] of [['receiver_id', 10], ['sender_id', 11], ['is_read', false]]) {
    assert.ok(calls[0].methods.some(([method, field, actual]) => method === 'eq' && field === key && actual === value));
  }
});

test('merged listing deletion checks ownership and retains images and child records for soft-deleted listings', async (t) => {
  const calls = mockQueries(t, [
    { table: 'properties', result: { data: { owner_id: 10 } } },
    { table: 'properties', result: {} },
    { table: 'properties', result: { data: { owner_id: 11 } } }
  ]);
  await propertyService.deleteProperty('3', 10);
  assert.deepEqual(calls[1].methods.find(([method]) => method === 'update')[1], { status: 'DELETED' });
  await assert.rejects(propertyService.deleteProperty(4, 10), { statusCode: 403 });
  assert.equal(calls.some((call) => call.methods.some(([method]) => method === 'delete')), false);
});

test('agents cannot discover the identity of users who reported their listings', async (t) => {
  mockQueries(t, [
    { table: 'properties', result: { data: [{ id: 4, owner_id: 9 }] } },
    { table: 'property_reports', result: { data: [{ id: 3, property_id: 4, reporter_id: 50, reporter: { email: 'reporter@example.test' } }] } },
    { table: 'property_report_appeals', result: { data: [] } }
  ]);
  const { violations } = await appealService.getAgentViolations(9);
  assert.equal(violations[0].reporter_id, undefined);
  assert.equal(violations[0].reporter, undefined);
});

test('inline image uploads reject active SVG/scripts and cross-owner deletion targets', async (t) => {
  const original = supabase.storage.from;
  supabase.storage.from = () => { throw new Error('Unexpected storage access'); };
  t.after(() => { supabase.storage.from = original; });
  for (const value of ['javascript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', { image: 'bad' }]) {
    await assert.rejects(savePublicImage(value, 'listings', 1), { statusCode: 400 });
  }
  await deleteOwnedListingImage('https://security-test.supabase.co/storage/v1/object/public/property-images/listings/2/listings-2-00000000-0000-0000-0000-000000000000.jpg', 1);
  await deleteOwnedListingImage('https://attacker.example/storage/v1/object/public/property-images/listings/1/listings-1-00000000-0000-0000-0000-000000000000.jpg', 1);
  await deleteOwnedListingImage('/uploads/..%2Fsecret', 1);
});
