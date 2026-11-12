const adminKycService = require('../services/adminKycService');

const ERROR_STATUS_CODES = {
  'Admin not found': 404,
  'Verification not found': 404,
  'Permission denied': 403,
  'Missing adminId': 400,
  'Invalid adminId': 400,
  'Missing verificationId': 400,
  'Invalid verificationId': 400,
  'Missing rejectReason': 400,
  'Only rejected or pending verifications can be approved': 400,
  'Invalid KYC list query': 400
};

const getStatusCode = (error) => ERROR_STATUS_CODES[error.message] || 500;
const getSafeError = (error) => ERROR_STATUS_CODES[error.message] ? error.message : 'Internal server error';

const listVerifications = async (req, res) => {
  try {
    const result = await adminKycService.listVerifications(req.user.id, req.query);

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(getStatusCode(error)).json({ error: getSafeError(error) });
  }
};

const getVerificationDetail = async (req, res) => {
  try {
    const verification = await adminKycService.getVerificationDetail(
      req.user.id,
      req.params.verificationId
    );

    res.status(200).json({
      success: true,
      verification
    });
  } catch (error) {
    res.status(getStatusCode(error)).json({ error: getSafeError(error) });
  }
};

const approveVerification = async (req, res) => {
  try {
    const result = await adminKycService.approveVerification(
      req.user.id,
      req.params.verificationId
    );

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(getStatusCode(error)).json({ error: getSafeError(error) });
  }
};

const rejectVerification = async (req, res) => {
  try {
    const result = await adminKycService.rejectVerification(
      req.user.id,
      req.params.verificationId,
      req.body.rejectReason
    );

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(getStatusCode(error)).json({ error: getSafeError(error) });
  }
};

module.exports = {
  listVerifications,
  getVerificationDetail,
  approveVerification,
  rejectVerification
};
