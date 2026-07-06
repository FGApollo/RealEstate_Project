const authService = require('../services/authService');

const register = async (req, res) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Please provide name, email and password' });
    }

    const user = await authService.registerUser({ name, email, password, role, phone });
    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide email and password' });
    }

    const user = await authService.loginUser({ email, password });
    res.status(200).json({ message: 'Login successful', user });
  } catch (error) {
    res.status(401).json({ error: error.message });
  }
};

const googleLogin = async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential missing' });
    }

    const user = await authService.googleLogin(credential);
    res.status(200).json({ message: 'Google login successful', user });
  } catch (error) {
    console.error('Google login error:', error);
    res.status(401).json({ error: 'Google authentication failed' });
  }
};

const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await authService.getUserById(Number(id));
    res.status(200).json({ user });
  } catch (error) {
    res.status(404).json({ error: error.message });
  }
};

module.exports = {
  register,
  login,
  googleLogin,
  getUserById
};
