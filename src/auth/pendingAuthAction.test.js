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
