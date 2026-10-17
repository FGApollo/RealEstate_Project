import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearPendingAuthAction,
  normalizePendingAuthAction,
  readPendingAuthAction,
  savePendingAuthAction
} from './pendingAuthAction.js';

const stored = new Map();
globalThis.window = {
  sessionStorage: {
    getItem: (key) => stored.get(key) || null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key)
  }
};

test('pending favorite action keeps only its allowlisted property and return path', () => {
  clearPendingAuthAction();
  assert.equal(savePendingAuthAction({
    type: 'FAVORITE_PROPERTY',
    propertyId: 123,
    returnTo: '/?propertyId=123',
    run: 'alert(1)'
  }), true);
  assert.deepEqual(readPendingAuthAction(), {
    type: 'FAVORITE_PROPERTY',
    propertyId: '123',
    returnTo: '/?propertyId=123'
  });
});

test('pending return paths reject outside origins and unapproved routes', () => {
  assert.equal(normalizePendingAuthAction({ type: 'NAVIGATE', returnTo: 'https://evil.example' }), null);
  assert.equal(normalizePendingAuthAction({ type: 'NAVIGATE', returnTo: '//evil.example/path' }), null);
  assert.equal(normalizePendingAuthAction({ type: 'NAVIGATE', returnTo: '/admin/delete-all' }), null);
});

test('pending navigation preserves only bounded UI state', () => {
  assert.deepEqual(normalizePendingAuthAction({
    type: 'NAVIGATE',
    returnTo: '/swipe/V%C4%83n%20Ph%C3%B2ng',
    routeState: {
      activeView: 'saved',
      filters: { categories: ['Văn Phòng'], maxPrice: '5000000', handler: 'evil()' },
      callback: 'evil()'
    }
  }), {
    type: 'NAVIGATE',
    returnTo: '/swipe/V%C4%83n%20Ph%C3%B2ng',
    routeState: { activeView: 'saved', filters: { maxPrice: '5000000', categories: ['Văn Phòng'] } }
  });
});

test('expired pending actions are discarded', () => {
  clearPendingAuthAction();
  stored.set('swipeNest.pendingAuthAction.v1', JSON.stringify({
    version: 1,
    createdAt: Date.now() - 31 * 60 * 1000,
    action: { type: 'NAVIGATE', returnTo: '/chat' }
  }));
  assert.equal(readPendingAuthAction(), null);
  assert.equal(stored.size, 0);
});

test('payment return keeps only the UUID path and discards provider query claims', () => {
  const path = '/sale/payment/12345678-abcd-1234-abcd-123456789abc';
  assert.deepEqual(normalizePendingAuthAction({ type: 'NAVIGATE', returnTo: `${path}?status=PAID&code=00&returnTo=https://evil.example` }), { type: 'NAVIGATE', returnTo: path });
  assert.equal(normalizePendingAuthAction({ type: 'NAVIGATE', returnTo: '/sale/payment/not-an-order' }), null);
});

test('clearing an old discovery intent allows a fresh protected action to be preserved', () => {
  savePendingAuthAction({ type: 'NAVIGATE', returnTo: '/swipe/V%C4%83n%20Ph%C3%B2ng' });
  clearPendingAuthAction();
  assert.equal(readPendingAuthAction(), null);
  assert.equal(stored.size, 0);
  savePendingAuthAction({ type: 'FAVORITE_PROPERTY', propertyId: 123 });
  assert.deepEqual(readPendingAuthAction(), {
    type: 'FAVORITE_PROPERTY', propertyId: '123', returnTo: '/?propertyId=123'
  });
  clearPendingAuthAction();
});
