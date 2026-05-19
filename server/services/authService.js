const bcrypt = require('bcrypt');
const { OAuth2Client } = require('google-auth-library');
const { supabase } = require('../config/supabase');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const registerUser = async ({ name, email, password }) => {
  // Check if user exists
  const { data: existingUser } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (existingUser) {
    throw new Error('User with this email already exists');
  }

  // Hash password
  const saltRounds = 10;
  const hashedPassword = await bcrypt.hash(password, saltRounds);

  // Insert
  const { data, error } = await supabase
    .from('users')
    .insert([{ name, email, password: hashedPassword }])
    .select()
    .single();

  if (error) throw new Error(error.message);

  delete data.password;
  return data;
};

const loginUser = async ({ email, password }) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (error || !user || !user.password) {
    throw new Error('Invalid email or password');
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new Error('Invalid email or password');
  }

  delete user.password;
  return user;
};

const googleLogin = async (credential) => {
  let email, name;

  // Check if credential is a JWT (ID Token) or an Access Token
  if (credential.startsWith('eyJ') && credential.split('.').length === 3) {
    // Verify as ID Token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    email = payload.email;
    name = payload.name;
  } else {
    // Verify as Access Token by calling Google Userinfo API
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: {
        Authorization: `Bearer ${credential}`
      }
    });

    if (!response.ok) {
      throw new Error('Failed to verify Google access token');
    }

    const payload = await response.json();
    email = payload.email;
    name = payload.name;
  }

  if (!email) {
    throw new Error('Invalid Google token');
  }

  // Check if user exists in our DB
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', email)
    .single();

  if (user) {
    // User exists, log them in
    delete user.password;
    return user;
  } else {
    // User doesn't exist, create them. 
    // We don't have a password for Google users. Depending on your schema, 
    // the password column should ideally be nullable or we can store a random string.
    // Assuming password is not required strictly or can be null.
    const { data: newUser, error: createError } = await supabase
      .from('users')
      .insert([{ name, email, password: null }])
      .select()
      .single();

    if (createError) throw new Error(createError.message);
    
    delete newUser.password;
    return newUser;
  }
};

module.exports = {
  registerUser,
  loginUser,
  googleLogin
};
