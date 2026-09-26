const { supabase } = require('../config/supabase');

const DEFAULT_TRUST_SCORE = 50;
const MIN_TRUST_SCORE = 0;
const MAX_TRUST_SCORE = 100;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

const REPORT_PENALTIES = {
  WRONG_PRICE: -5,
  WRONG_IMAGE: -10,
  WRONG_LOCATION: -10,
  DUPLICATE: -5,
  ALREADY_RENTED: -8,
  SCAM: -30,
  OTHER: 0
};

const clampTrustScore = (score) => Math.max(MIN_TRUST_SCORE, Math.min(MAX_TRUST_SCORE, score));

const parseDatabaseTimestamp = (value) => {
  if (!value) return NaN;
  if (value instanceof Date) return value.getTime();

  const timestamp = String(value).trim();
  const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(timestamp);
  const normalizedTimestamp = timestamp.replace(' ', 'T');
  return new Date(hasTimezone ? normalizedTimestamp : `${normalizedTimestamp}Z`).getTime();
};

const getUserForTrustScore = async (userId, columns = 'id, trust_score') => {
  const { data: user, error } = await supabase
    .from('users')
    .select(columns)
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('User not found');
    }

    throw new Error(error.message);
  }

  if (!user) {
    throw new Error('User not found');
  }

  return user;
};

const getCurrentTrustScore = async (userId) => {
  const user = await getUserForTrustScore(userId);
  return Number(user.trust_score ?? DEFAULT_TRUST_SCORE);
};

const updateTrustScore = async (userId, action, pointChange, reason, options = {}) => {
  const scoreDelta = Number(pointChange);
  if (!Number.isFinite(scoreDelta)) {
    throw new Error('Invalid trust score value');
  }

  const user = await getUserForTrustScore(userId);
  const oldScore = Number(user.trust_score ?? DEFAULT_TRUST_SCORE);
  const newScore = clampTrustScore(oldScore + scoreDelta);

  const { error: updateError } = await supabase
    .from('users')
    .update({ trust_score: newScore })
    .eq('id', userId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: logError } = await supabase
    .from('trust_score_logs')
    .insert({
      user_id: userId,
      action,
      point_change: scoreDelta,
      old_score: oldScore,
      new_score: newScore,
      reason,
      related_property_id: options.related_property_id || null,
      related_report_id: options.related_report_id || null
    });

  if (logError) {
    throw new Error(logError.message);
  }

  return newScore;
};

const hasActionLog = async (userId, action) => {
  const { data, error } = await supabase
    .from('trust_score_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('action', action)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
};

const hasReportPenaltyLog = async (reportId) => {
  const { data, error } = await supabase
    .from('trust_score_logs')
    .select('id')
    .eq('related_report_id', reportId)
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return Boolean(data);
};

const applyOneTimeBonus = async (userId, action, pointChange, reason) => {
  if (await hasActionLog(userId, action)) {
    return {
      success: true,
      applied: false,
      message: 'Trust score bonus already applied',
      trustScore: await getCurrentTrustScore(userId)
    };
  }

  const trustScore = await updateTrustScore(userId, action, pointChange, reason);
  return {
    success: true,
    applied: true,
    message: 'Trust score bonus applied',
    trustScore
  };
};

const applyProfileCompletenessBonus = async (userId) => {
  const user = await getUserForTrustScore(userId, 'id, trust_score, avatar, name, phone');
  const hasCompletedProfile = Boolean(user.avatar) && Boolean(user.name) && Boolean(user.phone);

  if (!hasCompletedProfile) {
    return {
      success: true,
      applied: false,
      message: 'Profile is not complete',
      trustScore: Number(user.trust_score ?? DEFAULT_TRUST_SCORE)
    };
  }

  return applyOneTimeBonus(
    userId,
    'PROFILE_COMPLETED',
    5,
    'User completed profile with avatar, name and phone'
  );
};

const applyThirtyDaysNoViolationBonus = async (userId) => {
  const user = await getUserForTrustScore(userId, 'id, trust_score, created_at');
  const createdAt = parseDatabaseTimestamp(user.created_at);

  if (!Number.isFinite(createdAt) || Date.now() - createdAt < THIRTY_DAYS_MS) {
    return {
      success: true,
      applied: false,
      message: 'Account is not old enough for this bonus',
      trustScore: Number(user.trust_score ?? DEFAULT_TRUST_SCORE)
    };
  }

  if (await hasActionLog(userId, 'ACCOUNT_30_DAYS_CLEAN')) {
    return {
      success: true,
      applied: false,
      message: 'Trust score bonus already applied',
      trustScore: Number(user.trust_score ?? DEFAULT_TRUST_SCORE)
    };
  }

  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select('id')
    .eq('owner_id', userId);

  if (propertiesError) {
    throw new Error(propertiesError.message);
  }

  const propertyIds = (properties || []).map((property) => property.id);
  if (propertyIds.length > 0) {
    const { data: resolvedReports, error: reportsError } = await supabase
      .from('property_reports')
      .select('id, handled_at')
      .in('property_id', propertyIds)
      .eq('status', 'RESOLVED');

    if (reportsError) {
      throw new Error(reportsError.message);
    }

    if (resolvedReports && resolvedReports.length > 0) {
      // Find reports that were successfully appealed and had their penalties refunded
      const reportIds = resolvedReports.map((r) => r.id);
      const { data: refundedLogs } = await supabase
        .from('trust_score_logs')
        .select('related_report_id')
        .in('related_report_id', reportIds)
        .eq('action', 'APPEAL_PENALTY_REFUND');

      const refundedReportIds = new Set((refundedLogs || []).map((l) => l.related_report_id));
      const activeViolations = resolvedReports.filter((r) => !refundedReportIds.has(r.id));

      if (activeViolations.length > 0) {
        return {
          success: true,
          applied: false,
          message: 'Account has confirmed violations',
          trustScore: Number(user.trust_score ?? DEFAULT_TRUST_SCORE)
        };
      }
    }
  }

  return applyOneTimeBonus(
    userId,
    'ACCOUNT_30_DAYS_CLEAN',
    5,
    'Account active for 30 days without confirmed violations'
  );
};

const getReportById = async (reportId) => {
  const { data: report, error } = await supabase
    .from('property_reports')
    .select('id, property_id, reporter_id, reason, description, status')
    .eq('id', reportId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Report not found');
    }

    throw new Error(error.message);
  }

  if (!report) {
    throw new Error('Report not found');
  }

  return report;
};

const getPropertyById = async (propertyId) => {
  const { data: property, error } = await supabase
    .from('properties')
    .select('id, owner_id, is_hidden')
    .eq('id', propertyId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('Property not found');
    }

    throw new Error(error.message);
  }

  if (!property) {
    throw new Error('Property not found');
  }

  return property;
};

const applyReportPenalty = async (reportId, adminId) => {
  const report = await getReportById(reportId);

  if (report.status === 'RESOLVED') {
    return {
      success: true,
      applied: false,
      message: 'Report has already been resolved'
    };
  }

  if (await hasReportPenaltyLog(reportId)) {
    return {
      success: true,
      applied: false,
      message: 'Report penalty already applied'
    };
  }

  const property = await getPropertyById(report.property_id);
  const pointChange = REPORT_PENALTIES[report.reason] ?? 0;
  const handledAt = new Date().toISOString();

  const { error: reportUpdateError } = await supabase
    .from('property_reports')
    .update({
      status: 'RESOLVED',
      handled_by: adminId,
      handled_at: handledAt
    })
    .eq('id', report.id);

  if (reportUpdateError) {
    throw new Error(reportUpdateError.message);
  }

  if (pointChange === 0) {
    return {
      success: true,
      applied: false,
      message: 'Report resolved without trust score penalty',
      pointChange,
      reportId: report.id,
      propertyId: property.id,
      ownerId: property.owner_id
    };
  }

  const trustScore = await updateTrustScore(
    property.owner_id,
    `REPORT_${report.reason}`,
    pointChange,
    `Admin confirmed report: ${report.reason}`,
    {
      related_property_id: property.id,
      related_report_id: report.id
    }
  );

  return {
    success: true,
    applied: true,
    message: 'Report resolved and trust score penalty applied',
    pointChange,
    trustScore,
    reportId: report.id,
    propertyId: property.id,
    ownerId: property.owner_id
  };
};

const applyPropertyHiddenPenalty = async (propertyId, adminId, shouldPenalize = true) => {
  const property = await getPropertyById(propertyId);

  if (property.is_hidden === true) {
    return {
      success: true,
      applied: false,
      message: 'Property is already hidden'
    };
  }

  const { error: propertyUpdateError } = await supabase
    .from('properties')
    .update({ is_hidden: true })
    .eq('id', propertyId);

  if (propertyUpdateError) {
    throw new Error(propertyUpdateError.message);
  }

  let trustScore = null;
  if (shouldPenalize) {
    trustScore = await updateTrustScore(
      property.owner_id,
      'PROPERTY_HIDDEN_BY_ADMIN',
      -15,
      'Property hidden by admin',
      {
        related_property_id: propertyId,
        handled_by: adminId
      }
    );
  }

  return {
    success: true,
    applied: true,
    message: shouldPenalize
      ? 'Property hidden and trust score penalty applied'
      : 'Property hidden successfully',
    trustScore,
    propertyId,
    ownerId: property.owner_id
  };
};

const reverseReportPenalty = async (reportId, adminId, adminNote = '') => {
  // 1. Get report details
  const { data: report, error: reportErr } = await supabase
    .from('property_reports')
    .select('*, property:properties(id, owner_id, title)')
    .eq('id', reportId)
    .single();

  if (reportErr || !report) {
    throw new Error('Không tìm thấy báo cáo liên quan');
  }

  const ownerId = report.property?.owner_id;
  const propertyId = report.property_id;

  // 2. Check if an appeal refund has already been applied
  const { data: existingRefund } = await supabase
    .from('trust_score_logs')
    .select('id')
    .eq('action', 'APPEAL_PENALTY_REFUND')
    .eq('related_report_id', reportId)
    .limit(1);

  if (existingRefund && existingRefund.length > 0) {
    return {
      success: true,
      applied: false,
      message: 'Điểm phạt cho báo cáo này đã được hoàn trả trước đó'
    };
  }

  // 3. Find original penalty log
  const { data: penaltyLogs } = await supabase
    .from('trust_score_logs')
    .select('*')
    .eq('related_report_id', reportId)
    .lt('point_change', 0)
    .order('created_at', { ascending: false });

  // Calculate actual points deducted (preventing refund overshoot arbitrage)
  let refundPoints = 0;
  if (penaltyLogs && penaltyLogs.length > 0) {
    refundPoints = penaltyLogs.reduce((sum, log) => {
      const hasScoreHistory = log.old_score !== undefined && log.old_score !== null &&
                              log.new_score !== undefined && log.new_score !== null;
      const actualDeducted = hasScoreHistory
        ? Math.max(0, Number(log.old_score) - Number(log.new_score))
        : Math.abs(Number(log.point_change));
      return sum + actualDeducted;
    }, 0);
  } else {
    refundPoints = Math.abs(REPORT_PENALTIES[report.reason] ?? 5);
  }

  // 4. Refund trust score points
  let trustScore = null;
  if (ownerId && refundPoints > 0) {
    trustScore = await updateTrustScore(
      ownerId,
      'APPEAL_PENALTY_REFUND',
      refundPoints,
      adminNote || `Kháng cáo thành công - Hoàn lại ${refundPoints} điểm phạt cho báo cáo #${reportId}`,
      {
        related_property_id: propertyId,
        related_report_id: reportId,
        handled_by: adminId
      }
    );
  }

  // 5. Unhide property
  if (propertyId) {
    await supabase
      .from('properties')
      .update({ is_hidden: false })
      .eq('id', propertyId);
  }

  return {
    success: true,
    applied: true,
    message: `Đã chấp thuận kháng cáo, hoàn lại +${refundPoints} điểm và khôi phục hiển thị bài đăng.`,
    refundPoints,
    trustScore,
    propertyId,
    ownerId
  };
};

module.exports = {
  updateTrustScore,
  hasActionLog,
  hasReportPenaltyLog,
  applyOneTimeBonus,
  applyProfileCompletenessBonus,
  applyThirtyDaysNoViolationBonus,
  applyReportPenalty,
  applyPropertyHiddenPenalty,
  reverseReportPenalty
};
