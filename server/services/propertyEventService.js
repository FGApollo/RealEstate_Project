const propertyRepository = require('../repositories/propertyRepository');

const ALLOWED_ACTIONS = new Set(['LIKE', 'DISLIKE', 'VIEW']);

const recordEvent = async (userId, { propertyId, action }) => {
  const id = Number(propertyId);
  if (!Number.isSafeInteger(id) || id < 1) {
    const error = new Error('A valid propertyId is required.');
    error.statusCode = 400;
    throw error;
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    const error = new Error('Unsupported property action.');
    error.statusCode = 400;
    throw error;
  }
  return propertyRepository.recordEvent(userId, id, action);
};

module.exports = { recordEvent, ALLOWED_ACTIONS };
