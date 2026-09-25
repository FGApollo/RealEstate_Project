const COMMON_PASSWORDS = new Set([
  'password123456',
  'password1234567',
  'qwertyuiop12345',
  'letmeinplease123',
  'swipenest123456'
]);

const normalizeVietnamPhone = (phone) => {
  if (typeof phone !== 'string' || phone.length > 32) return null;
  const compact = phone.trim().replace(/[\s().-]/g, '');
  const normalized = /^\+84[35789]\d{8}$/.test(compact) ? `0${compact.slice(3)}` : compact;
  return /^0[35789]\d{8}$/.test(normalized) ? normalized : null;
};

const hasControlCharacters = (value) => [...value].some((character) => {
  const codePoint = character.codePointAt(0);
  return codePoint < 32 || codePoint === 127;
});

export const validateRegistration = ({ name, email, password, confirmPassword, intent, phone }) => {
  const errors = {};
  const cleanName = typeof name === 'string' && name.length <= 240 ? name.trim() : '';
  const cleanEmail = typeof email === 'string' && email.length <= 512 ? email.trim().toLowerCase() : '';
  const emailIsValid = cleanEmail.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(cleanEmail);
  const passwordValue = typeof password === 'string' ? password : '';
  const passwordLength = passwordValue.length <= 72 ? [...passwordValue].length : 73;
  const passwordBytes = passwordValue.length <= 72 ? new TextEncoder().encode(passwordValue).length : 73;

  if (!cleanName || [...cleanName].length > 120 || hasControlCharacters(cleanName)) {
    errors.name = 'Enter a name up to 120 characters.';
  }
  if (!emailIsValid) errors.email = 'Enter a valid email address.';
  if (!passwordValue.trim()) errors.password = 'Password cannot contain only spaces.';
  else if (passwordLength < 15) errors.password = 'Use at least 15 characters.';
  else if (passwordBytes > 72) errors.password = 'Password must be no more than 72 UTF-8 bytes.';
  else if (COMMON_PASSWORDS.has(passwordValue.toLowerCase())) {
    errors.password = 'Choose a less common password.';
  }
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.';
  if (intent === 'AGENT_SIGNUP' && !normalizeVietnamPhone(phone)) {
    errors.phone = 'Enter a valid Vietnamese mobile number.';
  }
  return errors;
};

export { normalizeVietnamPhone };
