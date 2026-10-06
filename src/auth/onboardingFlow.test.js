import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOnboardingAction } from './onboardingFlow.js';
import { getCategoryKey } from '../services/propertyCategory.js';

const roomPreference = { preferred_property_types: ['PHONG_TRO'] };
const roomPath = '/swipe/' + encodeURIComponent('Phòng Trọ');
const housePath = '/swipe/' + encodeURIComponent('Nhà Ở');

test('room selection replaces stale house discovery navigation and category filters', () => {
  const action = resolveOnboardingAction({
    type: 'NAVIGATE',
    returnTo: housePath,
    routeState: { filters: { categories: ['Nhà Ở'], maxPrice: '5000000' } }
  }, roomPreference);
  assert.equal(action.returnTo, roomPath);
  assert.deepEqual(action.routeState.filters, { maxPrice: '5000000', categories: ['Phòng Trọ'] });
});

test('newly completed survey opens its selected category without a pending action', () => {
  assert.equal(resolveOnboardingAction(null, roomPreference).returnTo, roomPath);
  assert.equal(getCategoryKey('PHONG_TRO'), 'Phòng Trọ');
  assert.equal(getCategoryKey('Phòng Trọ'), 'Phòng Trọ');
  assert.equal(getCategoryKey('Nhà trọ'), 'Phòng Trọ');
  assert.equal(getCategoryKey('Phong tro'), 'Phòng Trọ');
});

test('multiple property types open all discovery with the selected categories', () => {
  const action = resolveOnboardingAction(null, { preferred_property_types: ['PHONG_TRO', 'VAN_PHONG', 'PHONG_TRO'] });
  assert.equal(action.returnTo, '/swipe/' + encodeURIComponent('Tất cả'));
  assert.deepEqual(action.routeState.filters.categories, ['Phòng Trọ', 'Văn Phòng']);
});

test('favorite, chat, saved list, and property-specific contexts are preserved', () => {
  for (const pending of [
    { type: 'FAVORITE_PROPERTY', propertyId: '123', returnTo: '/?propertyId=123' },
    { type: 'OPEN_CHAT_BY_PROPERTY', propertyId: '123' },
    { type: 'NAVIGATE', returnTo: housePath, routeState: { activeView: 'saved' } },
    { type: 'NAVIGATE', returnTo: housePath, routeState: { selectPropertyId: 123 } }
  ]) assert.deepEqual(resolveOnboardingAction(pending, roomPreference), pending);
});

test('editing from discovery follows the new category while editing from profile returns to profile', () => {
  assert.equal(resolveOnboardingAction(null, roomPreference, housePath).returnTo, roomPath);
  assert.equal(resolveOnboardingAction(null, roomPreference, '/profile').returnTo, '/profile');
});

test('flexible preferences keep intended navigation and removed categories do not become house preferences', () => {
  const pending = { type: 'NAVIGATE', returnTo: housePath };
  assert.deepEqual(resolveOnboardingAction(pending, { preferred_property_types: [] }), pending);
  const action = resolveOnboardingAction(null, { preferred_property_types: ['DAT_NEN', 'UNKNOWN'] });
  assert.equal(action.returnTo, '/swipe/' + encodeURIComponent('Tất cả'));
  assert.deepEqual(action.routeState?.filters?.categories || [], []);
});
