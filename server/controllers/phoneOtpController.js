const phoneOtpService = require('../services/phoneOtpService');

const sendOtp = async (req, res) => {
  try {
    const { userId, phone } = req.body;

    if (!userId || !phone) {
      return res.status(400).json({ error: 'Missing userId or phone' });
    }

    const result = await phoneOtpService.sendOtp({ userId, phone });
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

const verifyOtp = async (req, res) => {
  try {
    const { userId, phone, otp } = req.body;

    if (!userId || !phone || !otp) {
      return res.status(400).json({ error: 'Missing userId, phone or otp' });
    }

    const result = await phoneOtpService.verifyOtp({ userId, phone, otp });
    res.status(200).json(result);
  } catch (error) {
    res.status(error.statusCode || 500).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  sendOtp,
  verifyOtp
};
