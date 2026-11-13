process.env.SUPABASE_URL ||= 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY ||= 'test-service-role-key';
process.env.JWT_SECRET ||= 'lifestyle-recommendation-test-secret-32-bytes-minimum';

const test = require('node:test');
const assert = require('node:assert/strict');
const recommendationService = require('../services/recommendationService');
const preferenceService = require('../services/preferenceService');
const propertyRepository = require('../repositories/propertyRepository');
const { locationKey, locationLabel, canonicalLocationKey, normalizeKey, propertyTypeKey } = require('../services/recommendationKeys');
const preferenceController = require('../controllers/preferenceController');
const preferenceRoutes = require('../routes/preferenceRoutes');
const { authenticate } = require('../middleware/authenticate');

const makeResponse = () => ({
  statusCode: null,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; }
});

const preference = {
  listing_type: 'RENT',
  preferred_property_types: ['CAN_HO'],
  preferred_location_keys: [locationKey({ city: 'TP. Hồ Chí Minh', district: 'Quận 7' })],
  min_price: 5000000,
  max_price: 20000000,
  min_bedrooms: 2,
  max_bedrooms: null,
  min_area: 30,
  max_area: 80,
  preferred_features: [normalizeKey('Ban công')],
  onboarding_completed: true
};

const matchingProperty = (id, extras = {}) => ({
  id,
  listing_type: 'RENT',
  property_type: 'Căn Hộ',
  city: 'TP. Hồ Chí Minh',
  district: 'Quận 7',
  price: 15000000,
  bedrooms: 2,
  area: 60,
  property_features: [{ feature_name: 'Ban công' }],
  lifestyle_tags: [],
  owner: { trust_score: 50 },
  ...extras
});

test('recommendation keys normalize property, location and feature labels', () => {
  assert.equal(propertyTypeKey('Căn Hộ'), 'CAN_HO');
  assert.equal(propertyTypeKey('Phòng Trọ'), 'PHONG_TRO');
  assert.equal(propertyTypeKey('Nhà trọ'), 'PHONG_TRO');
  assert.equal(propertyTypeKey('PHONG_TRO'), 'PHONG_TRO');
  assert.equal(normalizeKey('Ban công'), 'ban_cong');
  assert.equal(locationKey({ city: 'TP. Hồ Chí Minh', district: 'Quận 7' }), 'ho_chi_minh|quan_7');
  // Cùng một nơi dù ghi "TP.", "Thành phố" hay không ghi; khóa cũ đã lưu cũng được chuẩn hóa.
  assert.equal(locationKey({ city: 'Thành phố Hồ Chí Minh', district: 'Quận 7' }), 'ho_chi_minh|quan_7');
  assert.equal(locationKey({ city: 'Hồ Chí Minh', district: 'Quận 7' }), 'ho_chi_minh|quan_7');
  assert.equal(locationKey({ city: 'TP. Hồ Chí Minh', district: 'TP. Thủ Đức' }), 'ho_chi_minh|thu_duc');
  assert.equal(locationKey({ city: 'Tỉnh Bình Dương', district: 'Thành phố Dĩ An' }), 'binh_duong|di_an');
  assert.equal(canonicalLocationKey('tp_ho_chi_minh|quan_1'), 'ho_chi_minh|quan_1');
  // Hệ thống hành chính mới 2025 (2 cấp: Tỉnh/TP -> Phường/Xã) ghép đúng giữa tin mới và tin cũ đủ phường/quận.
  assert.equal(locationKey({ city: 'Thành phố Hồ Chí Minh', district: '', ward: 'Phường Sài Gòn' }), 'ho_chi_minh|phuong_sai_gon');
  assert.equal(locationKey({ city: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé' }), 'ho_chi_minh|phuong_sai_gon');
  assert.equal(locationLabel({ city: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé' }), 'Phường Sài Gòn, Thành phố Hồ Chí Minh');
});

test('preference options merge 2025 ward listings and legacy listings into clean ward labels', async (t) => {
  const originalFetch = propertyRepository.fetchPreferenceOptions;
  t.after(() => { propertyRepository.fetchPreferenceOptions = originalFetch; });
  propertyRepository.fetchPreferenceOptions = async () => [
    matchingProperty(1, { city: 'Thành phố Hồ Chí Minh', district: '', ward: 'Phường Sài Gòn' }),
    matchingProperty(2, { city: 'TP. Hồ Chí Minh', district: 'Quận 1', ward: 'Phường Bến Nghé' })
  ];
  const options = await preferenceService.getPreferenceOptions('RENT');
  assert.deepEqual(options.locations, [{ key: 'ho_chi_minh|phuong_sai_gon', label: 'Phường Sài Gòn, Thành phố Hồ Chí Minh' }]);
});

test('a full preference match scores above an unrelated listing', () => {
  const emptyBehavior = { propertyTypes: new Map(), locations: new Map(), features: new Map() };
  const match = recommendationService.scoreProperty(matchingProperty(1), preference, emptyBehavior);
  const unrelated = recommendationService.scoreProperty(matchingProperty(2, {
    property_type: 'Nhà Ở', city: 'Hà Nội', district: 'Ba Đình', price: 40000000,
    bedrooms: 1, area: 20, property_features: []
  }), preference, emptyBehavior);

  assert.equal(match.baseScore, 100);
  assert.ok(match.score > unrelated.score);
  assert.ok(match.reasons.includes('location match'));
  assert.ok(match.reasons.includes('budget match'));
});

test('positive and negative behavior signals change future scores for similar listings', () => {
  const positive = {
    propertyTypes: new Map([['CAN_HO', 2]]),
    locations: new Map([[locationKey({ city: 'TP. Hồ Chí Minh', district: 'Quận 7' }), 2]]),
    features: new Map([['ban_cong', 1]])
  };
  const negative = {
    propertyTypes: new Map([['CAN_HO', -2]]),
    locations: new Map([[locationKey({ city: 'TP. Hồ Chí Minh', district: 'Quận 7' }), -2]]),
    features: new Map([['ban_cong', -1]])
  };

  const likedScore = recommendationService.scoreProperty(matchingProperty(5), preference, positive).score;
  const dislikedScore = recommendationService.scoreProperty(matchingProperty(5), preference, negative).score;
  assert.ok(likedScore > dislikedScore);
});

test('unfavorite is the latest signal for a property and tempers its earlier like', async (t) => {
  const originalEvents = propertyRepository.fetchRecentEvents;
  const originalProperties = propertyRepository.fetchEventProperties;
  t.after(() => { propertyRepository.fetchRecentEvents = originalEvents; });
  t.after(() => { propertyRepository.fetchEventProperties = originalProperties; });
  const now = Date.now();
  propertyRepository.fetchRecentEvents = async () => [
    { property_id: 8, action: 'UNFAVORITE', created_at: new Date(now).toISOString() },
    { property_id: 8, action: 'FAVORITE', created_at: new Date(now - 1000).toISOString() },
    { property_id: 8, action: 'LIKE', created_at: new Date(now - 2000).toISOString() }
  ];
  propertyRepository.fetchEventProperties = async () => [matchingProperty(8)];

  const result = await recommendationService.buildBehaviorProfile(17);
  assert.ok(result.profile.propertyTypes.get('CAN_HO') < 0);
});

test('recommendation feed puts recent dislikes and other listing types after the personal picks, never favorites', async (t) => {
  const originals = {
    getPreferences: preferenceService.getPreferences,
    fetchRecommendationCandidates: propertyRepository.fetchRecommendationCandidates,
    fetchPropertiesByIds: propertyRepository.fetchPropertiesByIds,
    fetchFavoriteIds: propertyRepository.fetchFavoriteIds,
    fetchFavoriteCounts: propertyRepository.fetchFavoriteCounts,
    fetchRecentEvents: propertyRepository.fetchRecentEvents,
    fetchEventProperties: propertyRepository.fetchEventProperties
  };
  t.after(() => Object.assign(preferenceService, { getPreferences: originals.getPreferences }));
  t.after(() => Object.assign(propertyRepository, {
    fetchRecommendationCandidates: originals.fetchRecommendationCandidates,
    fetchPropertiesByIds: originals.fetchPropertiesByIds,
    fetchFavoriteIds: originals.fetchFavoriteIds,
    fetchFavoriteCounts: originals.fetchFavoriteCounts,
    fetchRecentEvents: originals.fetchRecentEvents,
    fetchEventProperties: originals.fetchEventProperties
  }));

  preferenceService.getPreferences = async (userId) => {
    assert.ok(userId === 17 || userId === 99);
    return preference;
  };
  propertyRepository.fetchRecommendationCandidates = async () => [
    matchingProperty(1),
    matchingProperty(2),
    matchingProperty(3),
    matchingProperty(4, { listing_type: null }),
    matchingProperty(5, { listing_type: 'SALE' })
  ];
  propertyRepository.fetchFavoriteIds = async (userId) => {
    assert.equal(userId, 17);
    return [3];
  };
  propertyRepository.fetchFavoriteCounts = async () => new Map();
  propertyRepository.fetchRecentEvents = async () => [
    { property_id: 2, action: 'DISLIKE', created_at: new Date().toISOString() }
  ];
  propertyRepository.fetchEventProperties = async () => [matchingProperty(2)];

  const result = await recommendationService.getRecommendations(17, { limit: 1, offset: 0 });
  assert.deepEqual(result.properties.map((property) => property.id), [1]);
  assert.equal(result.properties[0].feed_section, 'for_you');
  assert.equal(result.hasMore, true);
  assert.ok(result.properties[0].recommendation_debug.reasons.includes('property type match'));

  propertyRepository.fetchPropertiesByIds = async (ids) => ids.map((id) => matchingProperty(id, {
    listing_type: id === 4 ? null : 'RENT'
  }));
  propertyRepository.fetchFavoriteIds = async () => [1, 3];
  propertyRepository.fetchRecentEvents = async () => [
    { property_id: 4, action: 'DISLIKE', created_at: new Date().toISOString() }
  ];
  const nextPage = await recommendationService.getRecommendations(17, {
    limit: 1,
    offset: result.nextOffset,
    feedToken: result.feedToken
  });
  assert.deepEqual(nextPage.properties.map((property) => property.id), [4]);
  assert.equal(nextPage.properties[0].feed_section, 'for_you');
  await assert.rejects(
    recommendationService.getRecommendations(17, { limit: 1, offset: 1, feedToken: result.feedToken, filters: { district: 'Thủ Đức' } }),
    error => error.code === 'INVALID_RECOMMENDATION_FEED'
  );
  // Hết tin hợp gu: phần "Phổ biến" gồm tin khác loại thuê/bán (5) rồi tới tin vừa bỏ qua (2); tin đã thích (3) không lặp lại.
  assert.equal(nextPage.hasMore, true);
  const tail = await recommendationService.getRecommendations(17, { limit: 5, offset: nextPage.nextOffset, feedToken: result.feedToken });
  assert.deepEqual(tail.properties.map((property) => [property.id, property.feed_section]), [[5, 'popular'], [2, 'popular']]);
  assert.equal(tail.hasMore, false);
  await assert.rejects(
    recommendationService.getRecommendations(99, { limit: 1, offset: 1, feedToken: result.feedToken }),
    (error) => error.code === 'INVALID_RECOMMENDATION_FEED'
  );
});

test('preference controller derives identity from req.user and rejects a client userId', async (t) => {
  const original = preferenceService.savePreferences;
  let savedUserId;
  preferenceService.savePreferences = async (userId, body) => {
    savedUserId = userId;
    return { ...body, user_id: userId };
  };
  t.after(() => { preferenceService.savePreferences = original; });

  const blocked = makeResponse();
  await preferenceController.savePreferences({ user: { id: 10 }, body: { userId: 99 } }, blocked);
  assert.equal(blocked.statusCode, 400);
  assert.equal(savedUserId, undefined);

  const accepted = makeResponse();
  await preferenceController.savePreferences({
    user: { id: 10 },
    body: { listing_type: 'RENT', preferred_property_types: ['CAN_HO'] }
  }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(savedUserId, 10);
});

test('preference endpoints apply authentication before handlers', () => {
  assert.equal(preferenceRoutes.stack[0].handle, authenticate);
  const preferenceGet = preferenceRoutes.stack.find((layer) => layer.route?.path === '/preferences');
  assert.equal(preferenceGet.route.stack.at(-1).handle, preferenceController.getPreferences);
});

test('room survey preferences rank rooms first and room discovery excludes houses and sales', async (t) => {
  const preferenceOriginal = preferenceService.getPreferences;
  const originalRepository = { ...propertyRepository };
  t.after(() => {
    preferenceService.getPreferences = preferenceOriginal;
    Object.assign(propertyRepository, originalRepository);
  });
  preferenceService.getPreferences = async () => ({ ...preference, preferred_property_types: ['PHONG_TRO'] });
  propertyRepository.fetchRecommendationCandidates = async () => [
    matchingProperty(12, { property_type: 'Nhà Ở' }),
    matchingProperty(11, { property_type: 'Phòng Trọ' }),
    matchingProperty(13, { property_type: 'Phòng Trọ', listing_type: 'SALE' }),
    matchingProperty(14, { property_type: 'Nhà trọ' })
  ];
  propertyRepository.fetchFavoriteIds = async () => [];
  propertyRepository.fetchFavoriteCounts = async () => new Map();
  propertyRepository.fetchRecentEvents = async () => [];
  propertyRepository.fetchEventProperties = async () => [];

  const ranked = await recommendationService.getRecommendations(17);
  assert.equal(propertyTypeKey(ranked.properties[0].property_type), 'PHONG_TRO');
  const rooms = await recommendationService.getRecommendations(17, { category: 'Phòng Trọ' });
  const forYou = rooms.properties.filter((property) => property.feed_section === 'for_you');
  assert.deepEqual(forYou.map((property) => property.id).sort(), [11, 14]);
  // Phòng trọ để bán không hợp khảo sát (thuê) nên chỉ xuất hiện ở phần "Phổ biến" phía sau.
  assert.deepEqual(rooms.properties.filter((property) => property.feed_section === 'popular').map((property) => property.id), [13]);
  assert.ok(rooms.properties.every((property) => propertyTypeKey(property.property_type) === 'PHONG_TRO'));
});

test('unfinished or skipped onboarding can browse a fallback feed of rentals', async (t) => {
  const preferenceOriginal = preferenceService.getPreferences;
  const originalRepository = { ...propertyRepository };
  t.after(() => {
    preferenceService.getPreferences = preferenceOriginal;
    Object.assign(propertyRepository, originalRepository);
  });
  preferenceService.getPreferences = async () => null;
  propertyRepository.fetchRecommendationCandidates = async (listingType) => {
    // Lần gọi thứ hai (listingType null) lấy nguồn cho phần "Phổ biến".
    assert.ok(listingType === 'RENT' || listingType === null);
    return [
      matchingProperty(11, { property_type: 'Phòng Trọ' }),
      matchingProperty(12, { property_type: 'Nhà Ở' }),
      matchingProperty(13, { listing_type: 'SALE' })
    ];
  };
  propertyRepository.fetchFavoriteIds = async () => [];
  propertyRepository.fetchFavoriteCounts = async () => new Map();
  propertyRepository.fetchRecentEvents = async () => [];
  propertyRepository.fetchEventProperties = async () => [];
  const result = await recommendationService.getRecommendations(17);
  assert.deepEqual(result.properties.filter((property) => property.feed_section === 'for_you').map((property) => property.id).sort(), [11, 12]);
  assert.deepEqual(result.properties.filter((property) => property.feed_section === 'popular').map((property) => property.id), [13]);
});

test('saved location keys with an administrative prefix still match the listing location', () => {
  const emptyBehavior = { propertyTypes: new Map(), locations: new Map(), features: new Map() };
  const legacy = { ...preference, preferred_location_keys: ['tp_ho_chi_minh|quan_7'] };
  const result = recommendationService.scoreProperty(matchingProperty(21), legacy, emptyBehavior);
  assert.ok(result.reasons.includes('location match'));
});

test('recommendation API returns properties through the public DTO', async (t) => {
  const recommendationController = require('../controllers/recommendationController');
  const original = recommendationService.getRecommendations;
  t.after(() => { recommendationService.getRecommendations = original; });
  recommendationService.getRecommendations = async () => ({
    properties: [{ ...matchingProperty(41), owner: { name: 'A', verification_status: 'VERIFIED', email: 'x@y.z' } }],
    offset: 0, nextOffset: 1, hasMore: false, feedToken: 'token'
  });
  const res = makeResponse();
  await recommendationController.getRecommendations({ user: { id: 1 }, query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.properties[0].owner.verification_status, 'VERIFIED');
  assert.equal(Object.hasOwn(res.body.properties[0].owner, 'email'), false);
});
