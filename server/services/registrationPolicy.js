const resolvePublicRegistration = (intent, phone) => {
  if (!['USER_SIGNUP', 'AGENT_SIGNUP'].includes(intent)) {
    const error = new Error('Invalid registration intent');
    error.statusCode = 400;
    throw error;
  }

  const normalizedPhone = typeof phone === 'string' ? phone.trim() : '';
  if (intent === 'AGENT_SIGNUP' && !normalizedPhone) {
    const error = new Error('Agent phone is required');
    error.statusCode = 400;
    throw error;
  }

  return {
    role: intent === 'AGENT_SIGNUP' ? 'AGENT' : 'USER',
    phone: normalizedPhone || null
  };
};

module.exports = { resolvePublicRegistration };
