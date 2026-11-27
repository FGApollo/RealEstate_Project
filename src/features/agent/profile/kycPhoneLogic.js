import { normalizeVietnamPhone } from '../../../auth/registrationValidation.js';

export const resolveKycPhoneState = (currentUser) => {
  const rawPhone = typeof currentUser?.phone === 'string' ? currentUser.phone.trim() : '';
  const normalizedPhone = normalizeVietnamPhone(rawPhone);
  const registeredPhone = normalizedPhone || rawPhone;

  return {
    registeredPhone,
    hasRegisteredPhone: Boolean(registeredPhone),
    isPhoneVerified: Boolean(currentUser?.phone_verified)
  };
};

export const getEffectiveKycPhone = ({ currentUser, inputPhone }) => {
  const { registeredPhone, hasRegisteredPhone } = resolveKycPhoneState(currentUser);
  if (hasRegisteredPhone) {
    return registeredPhone;
  }
  const rawInput = typeof inputPhone === 'string' ? inputPhone.trim() : '';
  return normalizeVietnamPhone(rawInput) || rawInput;
};

export const isKycPhoneAlreadyVerified = ({ currentUser, phone }) => {
  if (!currentUser?.phone_verified) return false;
  const { registeredPhone, hasRegisteredPhone } = resolveKycPhoneState(currentUser);
  if (!hasRegisteredPhone) return false;
  const rawTarget = typeof phone === 'string' ? phone.trim() : '';
  const normalizedTarget = normalizeVietnamPhone(rawTarget) || rawTarget;
  return Boolean(normalizedTarget) && normalizedTarget === registeredPhone;
};
