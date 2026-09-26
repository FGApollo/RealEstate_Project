const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const googleIdentityService = require('./googleIdentityService');
const emailVerificationService = require('./emailVerificationService');
const { resolvePublicRegistration } = require('./registrationPolicy');
const {
  createValidationError,
  normalizeEmail,
  normalizeVietnamPhone,
  validateRegistration
} = require('./registrationValidation');

const PUBLIC_USER_FIELDS = [
  'id', 'name', 'email', 'avatar', 'role', 'phone', 'email_verified_at',
  'verification_status', 'trust_score'
];
const toPublicUser = (user) => Object.fromEntries(
  PUBLIC_USER_FIELDS.filter((field) => user[field] !== undefined).map((field) => [field, user[field]])
);

const serviceError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

const findUserByEmail = async (email) => {
  const { data, error } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const findUserById = async (id) => {
  const { data, error } = await supabase.from('users').select('*').eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const findGoogleIdentity = async (field, value) => {
  const { data, error } = await supabase
    .from('google_identities').select('subject, user_id').eq(field, value).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
};

const registerUser = async ({
  name,
  email,
  password,
  confirmPassword,
  intent = 'USER_SIGNUP',
  phone = null,
  role
}) => {
  if (role !== undefined) {
    throw serviceError('Invalid registration role', 400);
  }
  const registration = validateRegistration({ name, email, password, confirmPassword, intent, phone });
  emailVerificationService.prepareRegistrationDelivery();

  // Keep duplicate and new-account requests closer in cost to reduce timing-based email enumeration.
  const hashedPassword = await bcrypt.hash(registration.password, 12);
  const existingUser = await findUserByEmail(registration.email);
  if (existingUser) return { accepted: true };

  const { data, error } = await supabase
    .from('users')
    .insert([{
      name: registration.name,
      email: registration.email,
      password: hashedPassword,
      role: registration.role,
      phone: registration.phone,
      email_verified_at: null
    }])
    .select()
    .single();

  if (error?.code === '23505') return { accepted: true };
  if (error) {
    // Log only the database error code; never log submitted identity or password data.
    console.error('Registration user insert failed:', error.code || error.name || 'database_error');
    throw serviceError('Registration is temporarily unavailable', 503, 'REGISTRATION_UNAVAILABLE');
  }

  await emailVerificationService.issueAndSend(data);

  return { accepted: true };
};

const loginUser = async ({ email, password }) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', normalizeEmail(email))
    .single();

  if (error || !user || !user.password) {
    throw new Error('Invalid email or password');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Invalid email or password');
  }

  if (!user.email_verified_at) {
    throw serviceError(
      'Hãy xác minh email trước khi đăng nhập. Bạn có thể yêu cầu gửi lại liên kết xác minh.',
      403,
      'EMAIL_VERIFICATION_REQUIRED'
    );
  }

  return toPublicUser(user);
};

const markGoogleEmailVerified = async (user, googleEmail) => {
  if (normalizeEmail(user.email) !== googleEmail || user.email_verified_at) {
    return toPublicUser(user);
  }

  const verifiedAt = new Date().toISOString();
  const { data, error } = await supabase.from('users')
    .update({ email_verified_at: verifiedAt })
    .eq('id', user.id)
    .is('email_verified_at', null)
    .select('*')
    .maybeSingle();
  if (error) throw new Error(error.message);
  return toPublicUser(data || { ...user, email_verified_at: verifiedAt });
};

const googleLogin = async (credential, intent = 'LOGIN', phone = null, linkPassword = null) => {
  if (!['LOGIN', 'USER_SIGNUP', 'AGENT_SIGNUP'].includes(intent)) {
    throw serviceError('Invalid Google registration intent', 400);
  }

  const identity = await googleIdentityService.verifyGoogleIdentity(credential);
  const linkedIdentity = await findGoogleIdentity('subject', identity.subject);
  if (linkedIdentity) {
    const linkedUser = await findUserById(linkedIdentity.user_id);
    if (!linkedUser) throw serviceError('Linked account not found', 409);
    return markGoogleEmailVerified(linkedUser, identity.email);
  }

  const existingUser = await findUserByEmail(identity.email);
  if (existingUser) {
    const otherIdentity = await findGoogleIdentity('user_id', existingUser.id);
    if (otherIdentity && otherIdentity.subject !== identity.subject) {
      throw serviceError('Account is linked to a different Google identity', 409);
    }
    if (!identity.authoritativeEmail) {
      if (!existingUser.password) {
        throw serviceError('This account needs a separate recovery process before Google linking', 409);
      }
      if (typeof linkPassword !== 'string' || !linkPassword) {
        throw serviceError('Confirm your existing account password to link Google', 409, 'PASSWORD_LINK_REQUIRED');
      }
      const passwordMatches = await bcrypt.compare(linkPassword, existingUser.password);
      if (!passwordMatches) throw serviceError('Incorrect account password', 401);
    }

    if (!otherIdentity) {
      const { error } = await supabase.from('google_identities')
        .insert({ subject: identity.subject, user_id: existingUser.id });
      if (error) {
        const concurrentLink = await findGoogleIdentity('subject', identity.subject);
        if (!concurrentLink || concurrentLink.user_id !== existingUser.id) {
          throw serviceError('Google identity linking conflict', 409);
        }
      }
    }
    return markGoogleEmailVerified(existingUser, identity.email);
  }

  if (intent === 'LOGIN') {
    throw serviceError('No account found. Choose a registration page first', 404);
  }
  if (!identity.authoritativeEmail) {
    throw serviceError('Google cannot confirm current ownership of this third-party email', 409);
  }

  const normalizedPhone = intent === 'AGENT_SIGNUP' ? normalizeVietnamPhone(phone) : phone;
  if (intent === 'AGENT_SIGNUP' && !normalizedPhone) {
    throw createValidationError({ phone: 'Enter a valid Vietnamese mobile number' });
  }
  const registration = resolvePublicRegistration(intent, normalizedPhone);
  const { data: userId, error: provisionError } = await supabase.rpc('provision_google_user', {
    p_subject: identity.subject,
    p_email: identity.email,
    p_name: identity.name,
    p_avatar: identity.avatar,
    p_phone: registration.phone,
    p_role: registration.role
  });
  if (provisionError) {
    if (provisionError.code === '23505') {
      throw serviceError('An account for this Google identity or email already exists', 409);
    }
    throw new Error(provisionError.message);
  }

  const newUser = await findUserById(userId);
  if (!newUser) throw new Error('Provisioned user not found');
  return markGoogleEmailVerified(newUser, identity.email);
};

const getUserById = async (id) => {
  const { data, error } = await supabase
    .from('users')
    .select('id, name, avatar, role')
    .eq('id', id)
    .single();

  if (error) throw new Error(error.message);
  return data;
};

module.exports = {
  registerUser,
  loginUser,
  googleLogin,
  getUserById,
  toPublicUser,
  normalizeEmail
};
