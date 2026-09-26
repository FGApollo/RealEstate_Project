const { supabase } = require('../config/supabase');

const DEFAULT_TRUST_SCORE = 50;
const MIN_TRUST_SCORE = 0;
const MAX_TRUST_SCORE = 100;
const LOW_TRUST_SCORE_THRESHOLD = 30;
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

const enforceTrustScoreThresholds = async (userId, oldScore, newScore) => {
  if (!userId) return;

  // Case 1: Trust score drops to 30 or below (<= 30)
  if (newScore <= LOW_TRUST_SCORE_THRESHOLD) {
    const { error: hideError } = await supabase
      .from('properties')
      .update({ is_hidden: true })
      .eq('owner_id', userId)
      .or('is_hidden.is.null,is_hidden.eq.false');

    if (hideError) {
      console.error(`[Threshold Enforcement] Error auto-hiding properties for user ${userId}:`, hideError.message);
    } else {
      console.log(`[Threshold Enforcement] Auto-hid active properties for user ${userId} (Score: ${newScore} <= ${LOW_TRUST_SCORE_THRESHOLD}).`);
    }
  }

  // Case 2: Trust score recovers back to strictly above 30 (> 30) from 30 or below
  if (oldScore <= LOW_TRUST_SCORE_THRESHOLD && newScore > LOW_TRUST_SCORE_THRESHOLD) {
    const { data: hiddenProps } = await supabase
      .from('properties')
      .select('id')
      .eq('owner_id', userId)
      .eq('is_hidden', true);

    if (hiddenProps && hiddenProps.length > 0) {
      const hiddenPropIds = hiddenProps.map((p) => p.id);

      const { data: violatingReports } = await supabase
        .from('property_reports')
        .select('id, property_id')
        .in('property_id', hiddenPropIds)
        .eq('status', 'RESOLVED');

      let activeViolatingPropIds = new Set();
      if (violatingReports && violatingReports.length > 0) {
        const reportIds = violatingReports.map((r) => r.id);
        const { data: refundedLogs } = await supabase
          .from('trust_score_logs')
          .select('related_report_id')
          .in('related_report_id', reportIds)
          .eq('action', 'APPEAL_PENALTY_REFUND');

        const refundedReportIds = new Set(
          (refundedLogs || [])
            .filter((l) => l.related_report_id != null)
            .map((l) => Number(l.related_report_id))
        );

        activeViolatingPropIds = new Set(
          violatingReports
            .filter((r) => !refundedReportIds.has(Number(r.id)))
            .map((r) => r.property_id)
            .filter(Boolean)
        );
      }

      const propsToUnhide = hiddenPropIds.filter((id) => !activeViolatingPropIds.has(id));

      if (propsToUnhide.length > 0) {
        await supabase
          .from('properties')
          .update({ is_hidden: false })
          .in('id', propsToUnhide);

        console.log(`[Threshold Enforcement] Restored ${propsToUnhide.length} properties for user ${userId} (Score recovered to ${newScore} > ${LOW_TRUST_SCORE_THRESHOLD}).`);
      }
    }
  }
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

  // Trigger low trust score threshold enforcement
  await enforceTrustScoreThresholds(userId, oldScore, newScore);

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
  const hasAvatar = Boolean(user.avatar && String(user.avatar).trim());
  const hasName = Boolean(user.name && String(user.name).trim());
  const hasPhone = Boolean(user.phone && String(user.phone).trim());
  const hasCompletedProfile = hasAvatar && hasName && hasPhone;

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

      const refundedReportIds = new Set(
        (refundedLogs || [])
          .filter((l) => l.related_report_id != null)
          .map((l) => Number(l.related_report_id))
      );
      const activeViolations = resolvedReports.filter((r) => !refundedReportIds.has(Number(r.id)));

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

const hasActiveKycBonus = async (userId) => {
  const { data: approvedLogs, error: approvedError } = await supabase
    .from('trust_score_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('action', 'KYC_APPROVED');

  if (approvedError) {
    throw new Error(approvedError.message);
  }

  const { data: revokedLogs, error: revokedError } = await supabase
    .from('trust_score_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('action', 'KYC_REVOKED');

  if (revokedError) {
    throw new Error(revokedError.message);
  }

  const approvedCount = approvedLogs ? approvedLogs.length : 0;
  const revokedCount = revokedLogs ? revokedLogs.length : 0;
  return approvedCount > revokedCount;
};

const applyKycCompletenessBonus = async (userId) => {
  const user = await getUserForTrustScore(userId, 'id, trust_score, verification_status');

  if (user.verification_status !== 'VERIFIED') {
    return {
      success: true,
      applied: false,
      message: 'Tài khoản chưa hoàn tất xác thực định danh (KYC).',
      trustScore: Number(user.trust_score ?? DEFAULT_TRUST_SCORE)
    };
  }

  const hasActiveBonus = await hasActiveKycBonus(userId);
  if (hasActiveBonus) {
    return {
      success: true,
      applied: false,
      message: 'Điểm thưởng xác thực KYC đã được nhận trước đó.',
      trustScore: Number(user.trust_score ?? DEFAULT_TRUST_SCORE)
    };
  }

  const trustScore = await updateTrustScore(
    userId,
    'KYC_APPROVED',
    20,
    'Xác thực định danh môi giới (KYC) thành công'
  );

  return {
    success: true,
    applied: true,
    message: 'Nhận điểm thưởng KYC thành công (+20đ)',
    trustScore
  };
};

const getBonusTasksStatus = async (userId) => {
  const user = await getUserForTrustScore(
    userId,
    'id, trust_score, avatar, name, phone, created_at, verification_status'
  );

  // 1. Task: Profile completeness bonus
  const hasProfileBonus = await hasActionLog(userId, 'PROFILE_COMPLETED');
  const hasAvatar = Boolean(user.avatar && String(user.avatar).trim());
  const hasName = Boolean(user.name && String(user.name).trim());
  const hasPhone = Boolean(user.phone && String(user.phone).trim());
  const profileComplete = hasAvatar && hasName && hasPhone;

  // 2. Task: 30 days clean bonus
  const hasCleanBonus = await hasActionLog(userId, 'ACCOUNT_30_DAYS_CLEAN');
  const createdAt = parseDatabaseTimestamp(user.created_at);
  const now = Date.now();
  const ageMs = Number.isFinite(createdAt) ? Math.max(0, now - createdAt) : 0;
  const daysActive = Math.floor(ageMs / (24 * 60 * 60 * 1000));
  const daysRemaining = Math.max(0, 30 - daysActive);
  const isOldEnough = ageMs >= THIRTY_DAYS_MS;

  // Check active violations and appeals
  let activeViolationsCount = 0;
  let refundedAppealsCount = 0;
  let pendingAppealsCount = 0;

  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select('id')
    .eq('owner_id', userId);

  if (!propertiesError && properties && properties.length > 0) {
    const propertyIds = properties.map((property) => property.id);
    const { data: resolvedReports } = await supabase
      .from('property_reports')
      .select('id, handled_at')
      .in('property_id', propertyIds)
      .eq('status', 'RESOLVED');

  if (resolvedReports && resolvedReports.length > 0) {
      const reportIds = resolvedReports.map((r) => r.id);
      const { data: refundedLogs } = await supabase
        .from('trust_score_logs')
        .select('related_report_id')
        .in('related_report_id', reportIds)
        .eq('action', 'APPEAL_PENALTY_REFUND');

      const refundedReportIds = new Set(
        (refundedLogs || [])
          .filter((l) => l.related_report_id != null)
          .map((l) => Number(l.related_report_id))
      );
      refundedAppealsCount = refundedReportIds.size;
      const activeViolations = resolvedReports.filter((r) => !refundedReportIds.has(Number(r.id)));
      activeViolationsCount = activeViolations.length;

      if (activeViolationsCount > 0) {
        const activeReportIds = activeViolations.map((r) => r.id);
        const { data: pendingAppeals } = await supabase
          .from('property_report_appeals')
          .select('id')
          .in('report_id', activeReportIds)
          .eq('status', 'PENDING');

        pendingAppealsCount = pendingAppeals ? pendingAppeals.length : 0;
      }
    }
  }

  const cleanEligible = isOldEnough && activeViolationsCount === 0 && !hasCleanBonus;

  // 3. Task: KYC verification (manual claim)
  const isKycVerified = user.verification_status === 'VERIFIED';
  const isKycPending = user.verification_status === 'PENDING';
  const hasKycBonus = await hasActiveKycBonus(userId);

  return {
    trustScore: Number(user.trust_score ?? DEFAULT_TRUST_SCORE),
    verificationStatus: user.verification_status,
    tasks: [
      {
        id: 'PROFILE_COMPLETED',
        title: 'Hoàn thiện hồ sơ cá nhân',
        description: 'Cập nhật đầy đủ ảnh đại diện, họ tên và số điện thoại liên hệ.',
        points: 5,
        claimed: hasProfileBonus,
        eligible: profileComplete && !hasProfileBonus,
        progress: {
          hasAvatar,
          hasName,
          hasPhone,
          completedCount: (hasAvatar ? 1 : 0) + (hasName ? 1 : 0) + (hasPhone ? 1 : 0),
          totalCount: 3
        }
      },
      {
        id: 'ACCOUNT_30_DAYS_CLEAN',
        title: '30 ngày hoạt động uy tín',
        description: 'Tài khoản hoạt động tối thiểu 30 ngày và không có vi phạm được xác nhận.',
        points: 5,
        claimed: hasCleanBonus,
        eligible: cleanEligible,
        progress: {
          daysActive,
          daysRequired: 30,
          daysRemaining,
          isOldEnough,
          activeViolationsCount,
          refundedAppealsCount,
          pendingAppealsCount
        }
      },
      {
        id: 'KYC_VERIFIED',
        title: 'Xác thực định danh môi giới (KYC)',
        description: 'Xác minh CCCD/CMND để nâng cao uy tín với khách hàng và bảo mật tài khoản.',
        points: 20,
        claimed: hasKycBonus,
        eligible: isKycVerified && !hasKycBonus,
        isPending: isKycPending,
        status: user.verification_status
      }
    ]
  };
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

const reverseReportPenalty = async (reportId, adminId, adminNote = '', customRefundPoints = null) => {
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

  // 3. Determine refund points (custom or auto-calculated)
  let refundPoints = 0;
  if (customRefundPoints !== null && customRefundPoints !== undefined) {
    const parsed = Number(customRefundPoints);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
      throw new Error('Số điểm hoàn lại tùy chỉnh không hợp lệ (phải từ 0 đến 100).');
    }
    refundPoints = Math.round(parsed);
  } else {
    // Find original penalty log
    const { data: penaltyLogs } = await supabase
      .from('trust_score_logs')
      .select('*')
      .eq('related_report_id', reportId)
      .lt('point_change', 0)
      .order('created_at', { ascending: false });

    // Calculate actual points deducted (preventing refund overshoot arbitrage)
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

const adjustTrustScoreManually = async ({
  userId,
  email,
  adminId,
  pointChange,
  reason,
  relatedPropertyId = null,
  relatedReportId = null
}) => {
  if (!userId && !email) {
    throw new Error('Vui lòng cung cấp Email hoặc User ID của tài khoản cần điều chỉnh điểm.');
  }
  if (!adminId) {
    throw new Error('Thiếu ID Admin thực hiện thao tác.');
  }

  let targetUserId = userId ? Number(userId) : null;
  if (!targetUserId && email) {
    const trimmedEmail = String(email).trim().toLowerCase();
    const { data: userByEmail, error: emailErr } = await supabase
      .from('users')
      .select('id, name, email')
      .ilike('email', trimmedEmail)
      .maybeSingle();

    if (emailErr) {
      throw new Error(`Lỗi khi tìm kiếm email: ${emailErr.message}`);
    }
    if (!userByEmail) {
      throw new Error(`Không tìm thấy người dùng nào với email "${email}". Vui lòng kiểm tra lại.`);
    }
    targetUserId = userByEmail.id;
  }

  const delta = Number(pointChange);
  if (!Number.isInteger(delta) || delta === 0) {
    throw new Error('Số điểm điều chỉnh phải là số nguyên khác 0 (ví dụ: +10 hoặc -15).');
  }

  if (Math.abs(delta) > 100) {
    throw new Error('Biên độ điều chỉnh điểm không được vượt quá 100 điểm.');
  }

  const trimmedReason = (reason || '').trim();
  if (!trimmedReason || trimmedReason.length < 5) {
    throw new Error('Vui lòng cung cấp lý do điều chỉnh cụ thể (tối thiểu 5 ký tự) để phục vụ kiểm toán.');
  }

  const user = await getUserForTrustScore(targetUserId, 'id, name, email, role, trust_score');
  const oldScore = Number(user.trust_score ?? DEFAULT_TRUST_SCORE);
  const newScore = clampTrustScore(oldScore + delta);

  // Update user score
  const { error: updateError } = await supabase
    .from('users')
    .update({ trust_score: newScore })
    .eq('id', targetUserId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  // Log in trust_score_logs
  const { error: logError } = await supabase
    .from('trust_score_logs')
    .insert({
      user_id: targetUserId,
      action: 'ADMIN_MANUAL_ADJUSTMENT',
      point_change: delta,
      old_score: oldScore,
      new_score: newScore,
      reason: `[Admin can thiệp] ${trimmedReason}`,
      related_property_id: relatedPropertyId || null,
      related_report_id: relatedReportId || null
    });

  if (logError) {
    throw new Error(logError.message);
  }

  // Trigger low trust score threshold enforcement
  await enforceTrustScoreThresholds(targetUserId, oldScore, newScore);

  return {
    success: true,
    message: `Đã điều chỉnh ${delta > 0 ? `+${delta}` : delta} điểm cho người dùng ${user.name || user.email} (Điểm mới: ${newScore}).`,
    userId: targetUserId,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    },
    oldScore,
    newScore,
    pointChange: delta,
    reason: trimmedReason
  };
};

const getUserTrustScoreLogs = async (userId, { limit = 50, offset = 0 } = {}) => {
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 50));
  const safeOffset = Math.max(0, Number(offset) || 0);

  const { data: logs, count, error } = await supabase
    .from('trust_score_logs')
    .select('*', { count: 'exact' })
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(safeOffset, safeOffset + safeLimit - 1);

  if (error) {
    throw new Error(error.message);
  }

  // Enrich with related properties if any
  const propertyIds = [...new Set((logs || []).map((l) => l.related_property_id).filter(Boolean))];
  const propertyMap = new Map();
  if (propertyIds.length > 0) {
    const { data: properties } = await supabase
      .from('properties')
      .select('id, title, price, is_hidden')
      .in('id', propertyIds);
    if (properties) {
      properties.forEach((p) => propertyMap.set(p.id, p));
    }
  }

  const enrichedLogs = (logs || []).map((log) => ({
    ...log,
    property: log.related_property_id ? propertyMap.get(log.related_property_id) || null : null
  }));

  return {
    logs: enrichedLogs,
    total: count ?? enrichedLogs.length,
    limit: safeLimit,
    offset: safeOffset
  };
};

const getTrustScoreStats = async () => {
  const { data: allLogs, error } = await supabase
    .from('trust_score_logs')
    .select('action, point_change');

  if (error || !allLogs) {
    return { totalLogs: 0, totalBonus: 0, totalPenalty: 0, totalRefund: 0 };
  }

  let totalBonus = 0;
  let totalPenalty = 0;
  let totalRefund = 0;

  for (const log of allLogs) {
    const pts = Number(log.point_change) || 0;
    if (pts > 0) {
      if (log.action === 'APPEAL_PENALTY_REFUND') {
        totalRefund += pts;
      } else {
        totalBonus += pts;
      }
    } else if (pts < 0) {
      totalPenalty += Math.abs(pts);
    }
  }

  return {
    totalLogs: allLogs.length,
    totalBonus,
    totalPenalty,
    totalRefund
  };
};

const getAdminTrustScoreLogs = async ({
  page = 1,
  limit = 20,
  search = '',
  action = 'ALL',
  type = 'ALL'
} = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20));
  const offset = (safePage - 1) * safeLimit;

  let query = supabase
    .from('trust_score_logs')
    .select('*', { count: 'exact' });

  // Type filter
  if (type === 'BONUS') {
    query = query.gt('point_change', 0);
  } else if (type === 'PENALTY') {
    query = query.lt('point_change', 0);
  } else if (type === 'REFUND') {
    query = query.eq('action', 'APPEAL_PENALTY_REFUND');
  }

  // Action filter
  if (action && action !== 'ALL') {
    query = query.eq('action', action);
  }

  // Search filter
  const trimmedSearch = (search || '').trim();
  if (trimmedSearch) {
    // Check if search matches user name/email first
    const { data: matchedUsers } = await supabase
      .from('users')
      .select('id')
      .or(`name.ilike.%${trimmedSearch}%,email.ilike.%${trimmedSearch}%`)
      .limit(50);

    const matchedUserIds = (matchedUsers || []).map((u) => u.id);
    if (matchedUserIds.length > 0) {
      query = query.or(`user_id.in.(${matchedUserIds.join(',')}),reason.ilike.%${trimmedSearch}%`);
    } else {
      query = query.ilike('reason', `%${trimmedSearch}%`);
    }
  }

  query = query.order('created_at', { ascending: false })
    .range(offset, offset + safeLimit - 1);

  const { data: logs, count, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  // Batch load users
  const userIds = [...new Set((logs || []).map((l) => l.user_id).filter(Boolean))];
  const userMap = new Map();
  if (userIds.length > 0) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, email, avatar, role, phone, trust_score')
      .in('id', userIds);
    if (users) {
      users.forEach((u) => userMap.set(u.id, u));
    }
  }

  // Batch load properties
  const propertyIds = [...new Set((logs || []).map((l) => l.related_property_id).filter(Boolean))];
  const propertyMap = new Map();
  if (propertyIds.length > 0) {
    const { data: properties } = await supabase
      .from('properties')
      .select('id, title, price, is_hidden')
      .in('id', propertyIds);
    if (properties) {
      properties.forEach((p) => propertyMap.set(p.id, p));
    }
  }

  const enrichedLogs = (logs || []).map((log) => ({
    ...log,
    user: log.user_id ? userMap.get(log.user_id) || null : null,
    property: log.related_property_id ? propertyMap.get(log.related_property_id) || null : null
  }));

  const stats = await getTrustScoreStats();

  return {
    logs: enrichedLogs,
    pagination: {
      page: safePage,
      limit: safeLimit,
      total: count ?? enrichedLogs.length,
      totalPages: Math.ceil((count ?? enrichedLogs.length) / safeLimit) || 1
    },
    stats
  };
};

module.exports = {
  updateTrustScore,
  hasActionLog,
  hasReportPenaltyLog,
  applyOneTimeBonus,
  applyProfileCompletenessBonus,
  applyThirtyDaysNoViolationBonus,
  hasActiveKycBonus,
  applyKycCompletenessBonus,
  getBonusTasksStatus,
  applyReportPenalty,
  applyPropertyHiddenPenalty,
  reverseReportPenalty,
  getUserTrustScoreLogs,
  getAdminTrustScoreLogs,
  getTrustScoreStats,
  adjustTrustScoreManually,
  LOW_TRUST_SCORE_THRESHOLD,
  enforceTrustScoreThresholds
};
