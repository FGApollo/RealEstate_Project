const { OAuth2Client } = require('google-auth-library');

const googleClient = new OAuth2Client();

const authError = (message) => {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
};

const verifyGoogleIdentity = async (credential) => {
  if (typeof credential !== 'string' || !credential || credential.length > 16384) {
    throw authError('Invalid Google ID token');
  }

  const audience = process.env.GOOGLE_CLIENT_ID;
  if (!audience) throw new Error('GOOGLE_CLIENT_ID is required');

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({ idToken: credential, audience });
  } catch {
    throw authError('Invalid Google ID token');
  }

  const payload = ticket.getPayload();
  if (!payload || !payload.sub || !payload.email || payload.email_verified !== true) {
    throw authError('Google email is not verified');
  }

  const email = payload.email.trim().toLowerCase();
  const hostedDomain = typeof payload.hd === 'string' ? payload.hd.trim().toLowerCase() : null;
  const authoritativeEmail = email.endsWith('@gmail.com')
    || Boolean(hostedDomain && email.endsWith(`@${hostedDomain}`));

  return {
    subject: payload.sub,
    email,
    name: typeof payload.name === 'string' ? payload.name.trim() : '',
    avatar: typeof payload.picture === 'string' && payload.picture.startsWith('https://')
      ? payload.picture : null,
    authoritativeEmail
  };
};

module.exports = { verifyGoogleIdentity };
