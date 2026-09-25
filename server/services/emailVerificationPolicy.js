const crypto = require('crypto');

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;

const createVerificationToken = () => crypto.randomBytes(32).toString('base64url');
const hashVerificationToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const isVerificationTokenShapeValid = (token) => (
  typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token)
);

module.exports = {
  TOKEN_TTL_MS,
  createVerificationToken,
  hashVerificationToken,
  isVerificationTokenShapeValid
};
