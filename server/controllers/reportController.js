const { supabase } = require('../config/supabase');

const VALID_REASONS = [
  'WRONG_PRICE',
  'WRONG_IMAGE',
  'WRONG_LOCATION',
  'DUPLICATE',
  'ALREADY_RENTED',
  'SCAM',
  'OTHER'
];

const DEDUCTION_MAP = {
  'WRONG_PRICE': 5,
  'WRONG_IMAGE': 10,
  'WRONG_LOCATION': 10,
  'DUPLICATE': 5,
  'ALREADY_RENTED': 8,
  'SCAM': 30,
  'OTHER': 0
};

// 2.1. User gửi report bài đăng
// POST /api/reports
const createReport = async (req, res) => {
  const { propertyId, reporterId, reason, description } = req.body;

  if (!propertyId || !reporterId || !reason) {
    return res.status(400).json({ error: 'Thiếu thông tin bắt buộc (propertyId, reporterId, reason)' });
  }

  if (!VALID_REASONS.includes(reason)) {
    return res.status(400).json({ error: `Lý do không hợp lệ. Các lý do hợp lệ: ${VALID_REASONS.join(', ')}` });
  }

  try {
    // Check if property exists
    const { data: property, error: propErr } = await supabase
      .from('properties')
      .select('id, title, owner_id')
      .eq('id', propertyId)
      .single();

    if (propErr || !property) {
      return res.status(404).json({ error: 'Bất động sản không tồn tại' });
    }

    // Insert report with status = PENDING (chưa trừ điểm)
    const { data: newReport, error: insertErr } = await supabase
      .from('property_reports')
      .insert([{
        property_id: propertyId,
        reporter_id: reporterId,
        reason: reason,
        description: description || null,
        status: 'PENDING'
      }])
      .select()
      .single();

    if (insertErr) {
      return res.status(500).json({ error: insertErr.message || 'Lỗi khi tạo báo cáo' });
    }

    return res.status(201).json({
      success: true,
      message: 'Gửi báo cáo thành công. Báo cáo đang chờ Admin kiểm duyệt (PENDING).',
      report: newReport
    });
  } catch (err) {
    console.error('Error in createReport:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// 2.2. Admin xem danh sách report
// GET /api/reports/admin?status=PENDING
const getAdminReports = async (req, res) => {
  const { status } = req.query;

  try {
    let query = supabase
      .from('property_reports')
      .select(`
        *,
        property:properties!property_id(id, title, address, price, owner_id, owner:users!owner_id(id, name, email, trust_score, avatar)),
        reporter:users!reporter_id(id, name, email, avatar)
      `)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status.toUpperCase());
    }

    const { data: reports, error } = await query;

    if (error) {
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json(reports || []);
  } catch (err) {
    console.error('Error in getAdminReports:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// 2.3. Admin xác nhận report đúng
// POST /api/reports/admin/:reportId/resolve
const resolveReport = async (req, res) => {
  const { reportId } = req.params;
  const { adminId } = req.body;

  if (!adminId) {
    return res.status(400).json({ error: 'Thiếu adminId trong body' });
  }

  try {
    // 1. Fetch current report
    const { data: report, error: fetchErr } = await supabase
      .from('property_reports')
      .select(`
        *,
        property:properties!property_id(id, title, owner_id)
      `)
      .eq('id', reportId)
      .single();

    if (fetchErr || !report) {
      return res.status(404).json({ error: 'Báo cáo không tồn tại' });
    }

    // Check duplicate deduction rule: Nếu report đã RESOLVED rồi thì không trừ lại
    if (report.status === 'RESOLVED') {
      return res.status(400).json({ error: 'Báo cáo này đã được xác nhận (RESOLVED) trước đó, không thể trừ điểm lặp lại.' });
    }

    const deduction = DEDUCTION_MAP[report.reason] || 0;
    const now = new Date().toISOString();

    // 2. Đổi property_reports.status = RESOLVED, handled_by = adminId, handled_at = now()
    const { data: updatedReport, error: updErr } = await supabase
      .from('property_reports')
      .update({
        status: 'RESOLVED',
        handled_by: adminId,
        handled_at: now
      })
      .eq('id', reportId)
      .select()
      .single();

    if (updErr) {
      return res.status(500).json({ error: updErr.message || 'Lỗi khi cập nhật trạng thái báo cáo' });
    }

    // 3. Trừ điểm owner của property theo reason
    let newTrustScore = null;
    const ownerId = report.property?.owner_id || report.owner_id;

    if (ownerId && deduction > 0) {
      const { data: owner, error: ownerErr } = await supabase
        .from('users')
        .select('id, trust_score')
        .eq('id', ownerId)
        .single();

      if (!ownerErr && owner) {
        const currentScore = owner.trust_score ?? 100;
        newTrustScore = currentScore - deduction;

        await supabase
          .from('users')
          .update({ trust_score: newTrustScore })
          .eq('id', ownerId);

        // 4. Ghi lịch sử vào trust_score_logs
        try {
          await supabase
            .from('trust_score_logs')
            .insert([{
              user_id: ownerId,
              change_amount: -deduction,
              reason: `Report #${reportId} resolved: ${report.reason}`,
              created_at: now
            }]);
        } catch (logErr) {
          console.warn('Cảnh báo: Không thể ghi vào trust_score_logs:', logErr.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: `Xác nhận báo cáo vi phạm thành công. Đã trừ ${deduction} điểm của chủ bài đăng.`,
      report: updatedReport,
      deduction,
      ownerId,
      newTrustScore
    });
  } catch (err) {
    console.error('Error in resolveReport:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

// 2.4. Admin từ chối report sai
// POST /api/reports/admin/:reportId/reject
const rejectReport = async (req, res) => {
  const { reportId } = req.params;
  const { adminId } = req.body;

  if (!adminId) {
    return res.status(400).json({ error: 'Thiếu adminId trong body' });
  }

  try {
    const { data: report, error: fetchErr } = await supabase
      .from('property_reports')
      .select('*')
      .eq('id', reportId)
      .single();

    if (fetchErr || !report) {
      return res.status(404).json({ error: 'Báo cáo không tồn tại' });
    }

    const now = new Date().toISOString();

    // Đổi property_reports.status = REJECTED, handled_by = adminId, handled_at = now(), KHÔNG trừ điểm
    const { data: updatedReport, error: updErr } = await supabase
      .from('property_reports')
      .update({
        status: 'REJECTED',
        handled_by: adminId,
        handled_at: now
      })
      .eq('id', reportId)
      .select()
      .single();

    if (updErr) {
      return res.status(500).json({ error: updErr.message || 'Lỗi khi từ chối báo cáo' });
    }

    return res.status(200).json({
      success: true,
      message: 'Đã từ chối báo cáo sai/không đủ bằng chứng. Không trừ điểm chủ bài đăng.',
      report: updatedReport
    });
  } catch (err) {
    console.error('Error in rejectReport:', err);
    return res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

module.exports = {
  createReport,
  getAdminReports,
  resolveReport,
  rejectReport,
  VALID_REASONS,
  DEDUCTION_MAP
};
