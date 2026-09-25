const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeEmail,
  normalizeVietnamPhone,
  validatePassword,
  validateRegistration
} = require('../services/registrationValidation');
const {
  createVerificationToken,
  hashVerificationToken,
  isVerificationTokenShapeValid
} = require('../services/emailVerificationPolicy');

const validPassword = 'A memorable phrase, kept long';

test('registration normalizes email/name but preserves the exact password', () => {
  const registration = validateRegistration({
    name: '  Nguyen Van A  ',
    email: '  Test@Example.COM ',
    password: validPassword,
    confirmPassword: validPassword,
    intent: 'USER_SIGNUP'
  });

  assert.equal(registration.name, 'Nguyen Van A');
  assert.equal(registration.email, 'test@example.com');
  assert.equal(registration.password, validPassword);
  assert.equal(registration.role, 'USER');
});

test('weak, common, whitespace-only and bcrypt-overlong passwords are rejected', () => {
  assert.match(validatePassword('short'), /15 characters/);
  assert.match(validatePassword('               '), /only spaces/);
  assert.match(validatePassword('password1234567'), /common/);
  assert.match(validatePassword('é'.repeat(37)), /72 UTF-8 bytes/);
  assert.equal(validatePassword('Password with spaces 123'), null);
});

test('registration validates email, agent phone, and registration intent on the backend', () => {
  assert.throws(() => validateRegistration({
    name: 'Agent', email: 'invalid', password: validPassword, confirmPassword: validPassword,
    intent: 'AGENT_SIGNUP', phone: 'abc'
  }), (error) => {
    assert.equal(error.code, 'VALIDATION_ERROR');
    assert.ok(error.errors.email);
    assert.ok(error.errors.phone);
    return true;
  });

  assert.equal(normalizeVietnamPhone('+84 912 345 678'), '0912345678');
  assert.equal(normalizeVietnamPhone('0912345678'), '0912345678');
  assert.equal(normalizeVietnamPhone('0412345678'), null);
  assert.equal(normalizeEmail('  TEST@example.com  '), 'test@example.com');
  assert.throws(() => validateRegistration({
    name: 'User', email: 'user@example.com', password: validPassword,
    confirmPassword: `${validPassword}!`, intent: 'USER_SIGNUP'
  }), (error) => error.errors.confirmPassword === 'Passwords do not match');
});

test('verification token has 256 bits of randomness and only a one-way hash is stored', () => {
  const token = createVerificationToken();
  const tokenHash = hashVerificationToken(token);

  assert.equal(isVerificationTokenShapeValid(token), true);
  assert.equal(tokenHash.length, 64);
  assert.notEqual(tokenHash, token);
  assert.notEqual(createVerificationToken(), token);
  assert.equal(isVerificationTokenShapeValid(`${token}x`), false);
});
