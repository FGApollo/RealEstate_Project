import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatProfileDate,
  getRoleLabel,
  validateAvatarFile,
  validatePasswordForm,
  validateProfileForm
} from './userProfileValidation.js';

test('validateAvatarFile enforces MIME type and 5MB size limit', () => {
  assert.equal(validateAvatarFile({ type: 'image/webp', size: 1024 }), '');
  assert.ok(validateAvatarFile({ type: 'image/gif', size: 1024 }));
  assert.ok(validateAvatarFile({ type: 'image/png', size: 6 * 1024 * 1024 }));
});

test('validateProfileForm validates name and Vietnamese mobile phone numbers', () => {
  assert.ok(validateProfileForm({ name: '   ', phone: '' }).error);
  assert.ok(validateProfileForm({ name: 'An', phone: '12345' }).error);

  const valid = validateProfileForm({ name: '  Nguyen An  ', phone: '+84 912 345 678' });
  assert.equal(valid.error, '');
  assert.equal(valid.name, 'Nguyen An');
  assert.equal(valid.phone, '+84 912 345 678');

  const noPhone = validateProfileForm({ name: 'An', phone: '' });
  assert.equal(noPhone.error, '');
  assert.equal(noPhone.phone, null);
});

test('validatePasswordForm enforces current password, length >= 10, and confirmation', () => {
  assert.ok(validatePasswordForm({ hasPassword: true, currentPassword: '', newPassword: 'LongPassword123', confirmPassword: 'LongPassword123' }));
  assert.ok(validatePasswordForm({ hasPassword: false, currentPassword: '', newPassword: 'short', confirmPassword: 'short' }));
  assert.ok(validatePasswordForm({ hasPassword: false, currentPassword: '', newPassword: 'LongPassword123', confirmPassword: 'Different123' }));
  assert.equal(validatePasswordForm({ hasPassword: false, currentPassword: '', newPassword: 'LongPassword123', confirmPassword: 'LongPassword123' }), '');
});

test('formatProfileDate and getRoleLabel format fallback and role strings cleanly', () => {
  assert.equal(formatProfileDate(null), 'Mới tham gia');
  assert.equal(formatProfileDate('invalid-date'), 'Mới tham gia');
  assert.equal(getRoleLabel('USER'), 'Người tìm nhà');
  assert.equal(getRoleLabel('AGENT'), 'Môi giới');
  assert.equal(getRoleLabel('ADMIN'), 'Quản trị viên');
});
