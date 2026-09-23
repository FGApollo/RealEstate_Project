const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const googleIdentityService = require('./googleIdentityService');
const { resolvePublicRegistration } = require('./registrationPolicy');

const PUBLIC_USER_FIELDS = ['id', 'name', 'email', 'avatar', 'role', 'phone', 'verification_status', 'trust_score'];
const toPublicUser = (user) => Object.fromEntries(
  PUBLIC_USER_FIELDS.filter((field) => user[field] !== undefined).map((field) => [field, user[field]])
);

const serviceError = (message, statusCode, code) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
};

const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

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

const registerUser = async ({ name, email, password, intent = 'USER_SIGNUP', phone = null, role }) => {
  if (role !== undefined) {
    throw serviceError('Invalid registration role', 400);
  }
  const registration = resolvePublicRegistration(intent, phone);
  const normalizedEmail = normalizeEmail(email);

  // Check if user exists
  const existingUser = await findUserByEmail(normalizedEmail);

  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Hash password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Insert
  const { data, error } = await supabase
    .from('users')
    .insert([{ name, email: normalizedEmail, password: hashedPassword, ...registration }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  return toPublicUser(data);
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

  return toPublicUser(user);
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
    return toPublicUser(linkedUser);
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
    return toPublicUser(existingUser);
  }

  if (intent === 'LOGIN') {
    throw serviceError('No account found. Choose a registration page first', 404);
  }
  if (!identity.authoritativeEmail) {
    throw serviceError('Google cannot confirm current ownership of this third-party email', 409);
  }

  const registration = resolvePublicRegistration(intent, phone);
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
  return toPublicUser(newUser);
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
  toPublicUser
};
