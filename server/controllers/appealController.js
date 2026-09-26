const appealService = require('../services/appealService');

const submitAppeal = async (req, res) => {
  const { reportId, reason, evidenceUrl, evidenceUrls } = req.body;
  const agentId = req.user.id;

  try {
    const result = await appealService.submitAppeal({
      reportId: Number(reportId),
      agentId,
      reason,
      evidenceUrl,
      evidenceUrls
    });
    return res.status(201).json(result);
  } catch (error) {
    console.error('Error in submitAppeal controller:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Lỗi gửi khiếu nại' });
  }
};

const getAgentViolations = async (req, res) => {
  const agentId = req.user.id;

  try {
    const result = await appealService.getAgentViolations(agentId);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in getAgentViolations controller:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Lỗi tải danh sách vi phạm' });
  }
};

const getAdminAppeals = async (req, res) => {
  const { status } = req.query;

  try {
    const result = await appealService.getAdminAppeals(status);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in getAdminAppeals controller:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Lỗi tải danh sách khiếu nại' });
  }
};

const approveAppeal = async (req, res) => {
  const { appealId } = req.params;
  const adminId = req.user.id;
  const { adminNote, customRefundPoints } = req.body;

  try {
    const result = await appealService.approveAppeal(
      Number(appealId),
      adminId,
      adminNote,
      customRefundPoints
    );
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in approveAppeal controller:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Lỗi chấp thuận khiếu nại' });
  }
};

const rejectAppeal = async (req, res) => {
  const { appealId } = req.params;
  const adminId = req.user.id;
  const { adminNote } = req.body;

  try {
    const result = await appealService.rejectAppeal(Number(appealId), adminId, adminNote);
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in rejectAppeal controller:', error);
    const status = error.statusCode || 500;
    return res.status(status).json({ error: error.message || 'Lỗi bác bỏ khiếu nại' });
  }
};

const uploadEvidence = async (req, res) => {
  try {
    const files = [
      ...(req.files?.evidenceImages || []),
      ...(req.files?.evidenceImage || []),
      ...(Array.isArray(req.files) ? req.files : []),
      ...(req.file ? [req.file] : [])
    ];

    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một file hình ảnh bằng chứng (JPG, PNG, WEBP).' });
    }

    if (files.length > 5) {
      return res.status(400).json({ error: 'Mỗi lần chỉ được tải lên tối đa 5 hình ảnh bằng chứng.' });
    }

    const urls = [];
    for (const file of files) {
      const url = await appealService.saveEvidenceImage(file);
      urls.push(url);
    }

    return res.status(200).json({
      success: true,
      urls,
      url: urls[0],
      message: `Tải thành công ${urls.length} ảnh bằng chứng!`
    });
  } catch (error) {
    console.error('Error in uploadEvidence controller:', error);
    return res.status(500).json({ error: error.message || 'Lỗi tải lên ảnh bằng chứng' });
  }
};

const handleUploadError = (err, req, res, next) => {
  if (!err) return next();
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'Kích thước file ảnh không được vượt quá 5MB' });
  }
  return res.status(400).json({ error: err.message || 'Lỗi tải lên file' });
};

module.exports = {
  submitAppeal,
  getAgentViolations,
  getAdminAppeals,
  approveAppeal,
  rejectAppeal,
  uploadEvidence,
  handleUploadError
};
