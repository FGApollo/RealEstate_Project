const kycService = require('../services/kycService');
const SAFE_KYC_ERRORS = new Map([
  ['User not found', 404],
  ['User is already verified', 400],
  ['No pending KYC verification found', 400],
  ['Khong the doc anh CCCD da luu, vui long thu lai', 400]
]);
const sendKycError = (res, error) => {
  const status = SAFE_KYC_ERRORS.get(error.message);
  if (!status) console.error('KYC operation failed:', error.code || error.name || 'operation_error');
  return res.status(status || 500).json({ error: status ? error.message : 'Không thể xử lý xác minh lúc này. Vui lòng thử lại.' });
};

const getKycStatus = async (req, res) => {
  const userId = req.user.id;

  try {
    const status = await kycService.getKycStatus(userId);
    res.status(200).json(status);
  } catch (error) {
    sendKycError(res, error);
  }
};

const uploadCard = async (req, res) => {
  const { fullName, phone } = req.body;
  const userId = req.user.id;
  const frontImage = req.files?.frontImage?.[0];
  const backImage = req.files?.backImage?.[0];

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
    sendKycError(res, error);
  }
};

const uploadSelfie = async (req, res) => {
  const userId = req.user.id;
  const selfieImage = req.file;

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
    sendKycError(res, error);
  }
};

const handleUploadError = (err, req, res, next) => {
  if (!err) {
    return next();
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Each image must be 5MB or smaller' });
  }

  return res.status(400).json({ error: 'Invalid image upload request' });
};

module.exports = {
  getKycStatus,
  uploadCard,
  uploadSelfie,
  handleUploadError
};
