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
  'Only rejected or pending verifications can be approved': 400
};

const getStatusCode = (error) => ERROR_STATUS_CODES[error.message] || 500;

const getRejectedVerifications = async (req, res) => {
  try {
    const verifications = await adminKycService.getRejectedVerifications(req.query.adminId);

    res.status(200).json({
      success: true,
      verifications
    });
  } catch (error) {
    res.status(getStatusCode(error)).json({ error: error.message || 'Internal server error' });
  }
};

const getVerificationDetail = async (req, res) => {
  try {
    const verification = await adminKycService.getVerificationDetail(
      req.query.adminId,
      req.params.verificationId
    );

    res.status(200).json({
      success: true,
      verification
    });
  } catch (error) {
    res.status(getStatusCode(error)).json({ error: error.message || 'Internal server error' });
  }
};

const approveVerification = async (req, res) => {
  try {
    const result = await adminKycService.approveVerification(
      req.body.adminId,
      req.params.verificationId
    );

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(getStatusCode(error)).json({ error: error.message || 'Internal server error' });
  }
};

const rejectVerification = async (req, res) => {
  try {
    const result = await adminKycService.rejectVerification(
      req.body.adminId,
      req.params.verificationId,
      req.body.rejectReason
    );

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    res.status(getStatusCode(error)).json({ error: error.message || 'Internal server error' });
  }
};

module.exports = {
  getRejectedVerifications,
  getVerificationDetail,
  approveVerification,
  rejectVerification
};
