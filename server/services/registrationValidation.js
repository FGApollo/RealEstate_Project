const { resolvePublicRegistration } = require('./registrationPolicy');

const COMMON_PASSWORDS = new Set([
  'password123456',
  'password1234567',
  'qwertyuiop12345',
  'letmeinplease123',
  'swipenest123456'
]);

const normalizeEmail = (email) => (
  typeof email === 'string' && email.length <= 512 ? email.trim().toLowerCase() : ''
);

const createValidationError = (errors) => {
  const error = new Error('Please correct the highlighted registration fields');
  error.statusCode = 400;
  error.code = 'VALIDATION_ERROR';
  error.errors = errors;
  return error;
};

const validateEmail = (email) => {
  if (typeof email !== 'string' || email.length > 512) return false;
  const normalized = normalizeEmail(email);
  return normalized.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalized);
};

const validatePassword = (password) => {
  if (typeof password !== 'string') return 'Password is required';
  if (password.length > 72) return 'Password must be no more than 72 UTF-8 bytes';
  if (!password.trim()) return 'Password cannot contain only spaces';
  const characterCount = [...password].length;
  if (characterCount < 10) return 'Use at least 10 characters';
  if (Buffer.byteLength(password, 'utf8') > 72) {
    return 'Password must be no more than 72 UTF-8 bytes';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'Choose a less common password';
  }
  return null;
};

const normalizeVietnamPhone = (phone) => {
  if (typeof phone !== 'string' || phone.length > 32) return null;
  const compact = phone.trim().replace(/[\s().-]/g, '');
  const normalized = /^\+84[35789]\d{8}$/.test(compact)
    ? `0${compact.slice(3)}`
    : compact;
  return /^0[35789]\d{8}$/.test(normalized) ? normalized : null;
};

const hasControlCharacters = (value) => [...value].some((character) => {
  const codePoint = character.codePointAt(0);
  return codePoint < 32 || codePoint === 127;
});

const validateRegistration = ({
  name,
  email,
  password,
  confirmPassword,
  intent = 'USER_SIGNUP',
  phone = null
}) => {
  const errors = {};
  const normalizedName = typeof name === 'string' && name.length <= 240 ? name.trim() : '';
  const normalizedEmail = validateEmail(email) ? normalizeEmail(email) : '';

  if (!normalizedName || [...normalizedName].length > 120 || hasControlCharacters(normalizedName)) {
    errors.name = 'Enter a name up to 120 characters';
  }
  if (!validateEmail(email)) errors.email = 'Enter a valid email address';

  const passwordError = validatePassword(password);
  if (passwordError) errors.password = passwordError;
  if (typeof confirmPassword !== 'string' || confirmPassword !== password) {
    errors.confirmPassword = 'Passwords do not match';
  }

  let normalizedPhone = null;
  if (intent === 'AGENT_SIGNUP') {
    normalizedPhone = normalizeVietnamPhone(phone);
    if (!normalizedPhone) errors.phone = 'Enter a valid Vietnamese mobile number';
  }

  let registration;
  try {
    registration = resolvePublicRegistration(intent, normalizedPhone);
  } catch (error) {
    errors.intent = error.message;
  }

  if (Object.keys(errors).length) throw createValidationError(errors);

  return {
    name: normalizedName,
    email: normalizedEmail,
    password,
    ...registration
  };
};

module.exports = {
  COMMON_PASSWORDS,
  createValidationError,
  normalizeEmail,
  normalizeVietnamPhone,
  validateEmail,
  validatePassword,
  validateRegistration
};
