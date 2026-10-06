import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clearOnboardingSkip, effectiveOnboardingStatus, getOnboardingSessionKey,
  hasSkippedOnboardingForSession, skipOnboardingForSession
} from './onboardingSession.js';

const stored = new Map();
globalThis.window = {
  sessionStorage: {
    getItem: (key) => stored.get(key) ?? null,
    setItem: (key, value) => stored.set(key, value),
    removeItem: (key) => stored.delete(key)
  }
};
const accessToken = (sid, sub = '17', jti = 'token-1') => (
  'header.' + Buffer.from(JSON.stringify({ token_use: 'access', sid, sub, jti })).toString('base64url') + '.signature'
);
test.beforeEach(() => { clearOnboardingSkip(); stored.clear(); });

test('skipping survives a page reload and access token refresh in the same login session', async () => {
  const sessionKey = getOnboardingSessionKey(17, accessToken('session-a'));
  skipOnboardingForSession(sessionKey);
  const refreshedKey = getOnboardingSessionKey(17, accessToken('session-a', '17', 'token-2'));
  assert.equal(refreshedKey, sessionKey);
  const reloaded = await import('./onboardingSession.js?reload');
  assert.equal(reloaded.effectiveOnboardingStatus('required', refreshedKey), 'skipped');
});

test('a new login for the same account or another account must show an unfinished survey', () => {
  skipOnboardingForSession(getOnboardingSessionKey(17, accessToken('session-a')));
  assert.equal(effectiveOnboardingStatus('required', getOnboardingSessionKey(17, accessToken('session-b'))), 'required');
  assert.equal(effectiveOnboardingStatus('required', getOnboardingSessionKey(18, accessToken('session-a', '18'))), 'required');
});

test('logout and explicit login reset the skip record', () => {
  const key = getOnboardingSessionKey(17, accessToken('session-a'));
  skipOnboardingForSession(key);
  clearOnboardingSkip();
  assert.equal(hasSkippedOnboardingForSession(key), false);
  assert.equal(stored.size, 0);
});

test('skipping never replaces completed or unknown server onboarding status', () => {
  const key = getOnboardingSessionKey(17, accessToken('session-a'));
  skipOnboardingForSession(key);
  assert.equal(effectiveOnboardingStatus('complete', key), 'complete');
  assert.equal(effectiveOnboardingStatus('unknown', key), 'unknown');
  assert.equal(effectiveOnboardingStatus('required', null), 'required');
});

test('session scoping rejects malformed tokens and tokens belonging to another user', () => {
  assert.equal(getOnboardingSessionKey(17, 'invalid-token'), null);
  assert.equal(getOnboardingSessionKey(18, accessToken('session-a')), null);
  assert.equal(getOnboardingSessionKey(undefined, accessToken('session-a')), null);
});
