import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveKycPhoneState,
  getEffectiveKycPhone,
  isKycPhoneAlreadyVerified
} from './kycPhoneLogic.js';

test('uses normalized registered phone and ignores manual input when agent already has a phone', () => {
  const agent = { phone: '+84 908 111 222', phone_verified: false };
  const state = resolveKycPhoneState(agent);

  assert.equal(state.hasRegisteredPhone, true);
  assert.equal(state.registeredPhone, '0908111222');
  assert.equal(state.isPhoneVerified, false);

  assert.equal(
    getEffectiveKycPhone({ currentUser: agent, inputPhone: '0999888777' }),
    '0908111222'
  );
  assert.equal(
    isKycPhoneAlreadyVerified({ currentUser: agent, phone: '0908111222' }),
    false
  );
  assert.equal(
    isKycPhoneAlreadyVerified({
      currentUser: { ...agent, phone_verified: true },
      phone: '0908111222'
    }),
    true
  );
});

test('allows manual phone input when agent account does not have a registered phone', () => {
  const agentNoPhone = { phone: null, phone_verified: false };
  const state = resolveKycPhoneState(agentNoPhone);

  assert.equal(state.hasRegisteredPhone, false);
  assert.equal(state.registeredPhone, '');

  assert.equal(
    getEffectiveKycPhone({ currentUser: agentNoPhone, inputPhone: '+84 912 345 678' }),
    '0912345678'
  );
  assert.equal(
    getEffectiveKycPhone({ currentUser: { phone: '   ', phone_verified: false }, inputPhone: '0912345678' }),
    '0912345678'
  );
  assert.equal(
    isKycPhoneAlreadyVerified({ currentUser: { phone: '', phone_verified: true }, phone: '0912345678' }),
    false
  );
});
