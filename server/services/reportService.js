const { supabase } = require('../config/supabase');
const trustScoreService = require('./trustScoreService');

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

const VALID_REPORT_REASONS = new Set(VALID_REASONS);

const createServiceError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const validateReportReason = (reason) => {
  if (!VALID_REPORT_REASONS.has(reason)) {
    throw createServiceError(`Lý do không hợp lệ. Các lý do hợp lệ: ${VALID_REASONS.join(', ')}`, 400);
  }
};

const getPropertyForReport = async (propertyId) => {
  const { data: property, error } = await supabase
    .from('properties')
    .select('id, title, owner_id')
    .eq('id', propertyId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw createServiceError('Bất động sản không tồn tại', 404);
    }
    throw new Error(error.message);
  }

  if (!property) {
    throw createServiceError('Bất động sản không tồn tại', 404);
  }

  return property;
};

const createReport = async ({ propertyId, reporterId, reason, description }) => {
  if (!propertyId || !reporterId || !reason) {
    throw createServiceError('Thiếu thông tin bắt buộc (propertyId, reporterId, reason)', 400);
  }

  validateReportReason(reason);

  const property = await getPropertyForReport(propertyId);
  if (String(property.owner_id) === String(reporterId)) {
    throw createServiceError('You cannot report your own property', 400);
  }

  const { data: report, error } = await supabase
    .from('property_reports')
    .insert({
      property_id: propertyId,
      reporter_id: reporterId,
      reason,
      description: description || null,
      status: 'PENDING'
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return {
    success: true,
    message: 'Gửi báo cáo thành công. Báo cáo đang chờ Admin kiểm duyệt (PENDING).',
    report
  };
};

const attachPropertiesToReports = async (reports) => {
  const propertyIds = [...new Set((reports || []).map((report) => report.property_id).filter(Boolean))];
  if (propertyIds.length === 0) {
    return reports || [];
  }

  const { data: properties, error } = await supabase
    .from('properties')
    .select('id, title, price, is_hidden, owner_id, owner:users!owner_id(id, name, email, trust_score)')
    .in('id', propertyIds);

  if (error) {
    throw new Error(error.message);
  }

  const propertyMap = new Map((properties || []).map((property) => [property.id, property]));
  return reports.map((report) => ({
    ...report,
    property: propertyMap.get(report.property_id) || null
  }));
};

const getAdminReports = async (status) => {
  let query = supabase
    .from('property_reports')
    .select('*, reporter:users!reporter_id(id, name, email)')
    .order('created_at', { ascending: false });

  if (status) {
    query = query.eq('status', status.toUpperCase());
  }

  const { data: reports, error } = await query;

  if (error) {
    throw createServiceError(error.message, 500);
  }

  return {
    reports: await attachPropertiesToReports(reports || [])
  };
};

const resolveReport = async (reportId, adminId) => {
  if (!reportId || !adminId) {
    throw createServiceError('Thiếu adminId trong body', 400);
  }

  // Get report data first to ensure we have property_id regardless of penalty status
  const { data: reportData } = await supabase
    .from('property_reports')
    .select('property_id')
    .eq('id', reportId)
    .single();

  // 1. Apply report reason penalty to owner's trust score and mark report as RESOLVED
  const result = await trustScoreService.applyReportPenalty(reportId, adminId);

  // 2. Hide violating property automatically (without duplicate -15pt penalty; already penalized by report reason above)
  const targetPropertyId = result?.propertyId || reportData?.property_id;
  let hiddenResult = null;
  if (targetPropertyId) {
    try {
      hiddenResult = await trustScoreService.applyPropertyHiddenPenalty(targetPropertyId, adminId, false);
    } catch (hiddenErr) {
      console.error('Error applying property hidden penalty in resolveReport:', hiddenErr);
      // Fallback: Ensure property is marked as is_hidden = true
      await supabase
        .from('properties')
        .update({ is_hidden: true })
        .eq('id', targetPropertyId);
    }
  }

  return {
    success: true,
    message: result.message
      ? `${result.message}. Đã ẩn bài đăng vi phạm khỏi hệ thống.`
      : 'Xác nhận báo cáo vi phạm và ẩn bài đăng thành công.',
    result,
    hiddenResult,
    report: result
  };
};

const rejectReport = async (reportId, adminId) => {
  if (!reportId || !adminId) {
    throw createServiceError('Thiếu adminId trong body', 400);
  }

  const handledAt = new Date().toISOString();
  const { data: report, error } = await supabase
    .from('property_reports')
    .update({
      status: 'REJECTED',
      handled_by: adminId,
      handled_at: handledAt
    })
    .eq('id', reportId)
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw createServiceError('Báo cáo không tồn tại', 404);
    }
    throw new Error(error.message);
  }

  return {
    success: true,
    message: 'Đã từ chối báo cáo sai/không đủ bằng chứng. Không trừ điểm chủ bài đăng.',
    report
  };
};

module.exports = {
  createReport,
  getAdminReports,
  resolveReport,
  rejectReport,
  VALID_REASONS,
  DEDUCTION_MAP
};
