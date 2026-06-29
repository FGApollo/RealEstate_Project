const kycService = require('../services/kycService');

const getKycStatus = async (req, res) => {
  const { userId } = req.query;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId parameter' });
  }

  try {
    const status = await kycService.getKycStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    const statusCode = error.message === 'User not found' ? 404 : 500;
    res.status(statusCode).json({ error: error.message || 'Internal server error' });
  }
};

const uploadCard = async (req, res) => {
  const { userId, fullName, phone } = req.body;
  const frontImage = req.files?.frontImage?.[0];
  const backImage = req.files?.backImage?.[0];

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  if (!frontImage || !backImage) {
    return res.status(400).json({ error: 'Both frontImage and backImage are required' });
  }

  try {
    const result = await kycService.uploadCard({
      userId,
      fullName,
      phone,
      frontImage,
      backImage
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    const statusCode = error.message === 'User not found' ? 404 : 400;
    res.status(statusCode).json({ error: error.message || 'Failed to upload ID card images' });
  }
};

const uploadSelfie = async (req, res) => {
  const { userId } = req.body;
  const selfieImage = req.file;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  if (!selfieImage) {
    return res.status(400).json({ error: 'selfieImage is required' });
  }

  try {
    const result = await kycService.uploadSelfie({ userId, selfieImage });

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (error) {
    const statusCode = error.message === 'User not found' ? 404 : 400;
    res.status(statusCode).json({ error: error.message || 'Failed to upload selfie' });
  }
};

const handleUploadError = (err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Each image must be 5MB or smaller' });
  }

  return res.status(400).json({ error: err.message || 'Invalid upload request' });
};

module.exports = {
  getKycStatus,
  uploadCard,
  uploadSelfie,
  handleUploadError
};
