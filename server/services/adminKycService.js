const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');
const { signVerificationImages } = require('./kycStorage');

const ADMIN_ROLE = 'ADMIN';
const PENDING_STATUS = 'PENDING';
const REJECTED_STATUS = 'REJECTED';
const TRUST_ACTION_KYC_APPROVED = 'KYC_APPROVED';
const TRUST_ACTION_KYC_REVOKED = 'KYC_REVOKED';
const TRUST_BONUS_KYC_APPROVED = 20;

const trustScoreServicePath = path.join(__dirname, 'trustScoreService.js');
const trustScoreService = fs.existsSync(trustScoreServicePath)
  ? require('./trustScoreService')
  : null;

const parseRequiredId = (value, fieldName) => {
  if (value === undefined || value === null || value === '') {
    throw new Error(`Missing ${fieldName}`);
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}`);
  }

  return parsed;
};

const ensureAdmin = async (adminId) => {
  const parsedAdminId = parseRequiredId(adminId, 'adminId');

  const { data: admin, error } = await supabase
    .from('users')
    .select('id, name, email, role')
    .eq('id', parsedAdminId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch admin');
  }

  if (!admin) {
    throw new Error('Admin not found');
  }

  if (admin.role !== ADMIN_ROLE) {
    throw new Error('Permission denied');
  }

  return admin;
};

const fetchVerificationById = async (verificationId) => {
  const parsedVerificationId = parseRequiredId(verificationId, 'verificationId');

  const { data: verification, error } = await supabase
    .from('identity_verifications')
    .select('*')
    .eq('id', parsedVerificationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message || 'Failed to fetch verification');
  }

  if (!verification) {
    throw new Error('Verification not found');
  }

  return verification;
};

const fetchUsersMap = async (userIds) => {
  const uniqueUserIds = [...new Set(userIds.filter(Boolean))];

  if (uniqueUserIds.length === 0) {
    return new Map();
  }

  const { data: users, error } = await supabase
    .from('users')
    .select('id, name, email, phone, verification_status, trust_score')
    .in('id', uniqueUserIds);

  if (error) {
    throw new Error(error.message || 'Failed to fetch users');
  }

  return new Map((users || []).map((user) => [String(user.id), user]));
};

const attachUsers = async (verifications) => {
  const usersMap = await fetchUsersMap(verifications.map((verification) => verification.user_id));

  return verifications.map((verification) => ({
    ...verification,
    user: usersMap.get(String(verification.user_id)) || null
  }));
};

const parseListQuery = (query = {}) => {
  const status = String(query.status || PENDING_STATUS).toUpperCase();
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (![PENDING_STATUS, REJECTED_STATUS].includes(status)
    || !Number.isInteger(page) || page < 1 || page > 10000
    || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new Error('Invalid KYC list query');
  }
  return { status, page, limit };
};

// Hồ sơ mới nhất của mỗi tài khoản theo trạng thái (PENDING hoặc REJECTED), phân trang ở database.
const listVerifications = async (adminId, query) => {
  await ensureAdmin(adminId);
  const { status, page, limit } = parseListQuery(query);

  const { data, error } = await supabase.rpc('admin_kyc_list', {
    p_status: status, p_page: page, p_limit: limit
  });

  if (error) {
    throw new Error(error.message || 'Failed to fetch verifications');
  }

  return {
    status,
    verifications: data?.items || [],
    total: Number(data?.total || 0),
    page,
    limit
  };
};

const getVerificationDetail = async (adminId, verificationId) => {
  await ensureAdmin(adminId);

  const verification = await fetchVerificationById(verificationId);
  const [verificationWithUser] = await attachUsers([verification]);

  return signVerificationImages(verificationWithUser);
};

const approveVerification = async (adminId, verificationId) => {
  const admin = await ensureAdmin(adminId);
  const parsedVerificationId = parseRequiredId(verificationId, 'verificationId');

  // Một transaction trong database: hồ sơ và trạng thái tài khoản cùng đổi hoặc cùng giữ nguyên.
  const { data, error } = await supabase.rpc('admin_approve_kyc', {
    p_verification_id: parsedVerificationId, p_admin_id: admin.id
  });

  if (error) {
    const known = ['Verification not found', 'Permission denied', 'Only rejected or pending verifications can be approved']
      .find((message) => (error.message || '').includes(message));
    throw new Error(known || 'Failed to approve verification');
  }

  const verification = { id: data.id, status: data.status, user_id: data.user_id };

  if (!data.applied) {
    return {
      message: 'KYC verification is already approved',
      verification,
      trustScore: {
        applied: false,
        action: TRUST_ACTION_KYC_APPROVED,
        reason: 'Verification was already approved'
      },
      applied: false
    };
  }

  // Điểm thưởng KYC (+20) do môi giới tự nhận trong mục nhiệm vụ, không cộng tự động.
  return {
    message: 'KYC verification approved successfully',
    verification,
    trustScore: {
      applied: false,
      action: TRUST_ACTION_KYC_APPROVED,
      reason: 'Manual claim required'
    },
    applied: true
  };
};

const rejectVerification = async (adminId, verificationId, rejectReason) => {
  const admin = await ensureAdmin(adminId);

  if (!rejectReason || !String(rejectReason).trim()) {
    throw new Error('Missing rejectReason');
  }

  const verification = await fetchVerificationById(verificationId);
  const trimmedReason = String(rejectReason).trim();
  const now = new Date().toISOString();

  const { data: updatedVerification, error: verificationError } = await supabase
    .from('identity_verifications')
    .update({
      status: REJECTED_STATUS,
      reject_reason: trimmedReason,
      reviewed_by: admin.id,
      reviewed_at: now,
      updated_at: now
    })
    .eq('id', verification.id)
    .select('id, status, reject_reason, user_id')
    .single();

  if (verificationError) {
    throw new Error(verificationError.message || 'Failed to reject verification');
  }

  const { error: userError } = await supabase
    .from('users')
    .update({
      verification_status: REJECTED_STATUS,
      updated_at: now
    })
    .eq('id', verification.user_id);

  if (userError) {
    throw new Error(userError.message || 'Failed to update user verification status');
  }

  // Revoke KYC bonus points if user currently holds active bonus
  let trustScoreRevocation = { applied: false };
  try {
    const { data: approvedLogs } = await supabase
      .from('trust_score_logs')
      .select('id')
      .eq('user_id', verification.user_id)
      .eq('action', TRUST_ACTION_KYC_APPROVED);

    const { data: revokedLogs } = await supabase
      .from('trust_score_logs')
      .select('id')
      .eq('user_id', verification.user_id)
      .eq('action', TRUST_ACTION_KYC_REVOKED);

    const approvedCount = approvedLogs ? approvedLogs.length : 0;
    const revokedCount = revokedLogs ? revokedLogs.length : 0;

    if (approvedCount > revokedCount) {
      if (typeof trustScoreService?.updateTrustScore === 'function') {
        const newScore = await trustScoreService.updateTrustScore(
          verification.user_id,
          TRUST_ACTION_KYC_REVOKED,
          -TRUST_BONUS_KYC_APPROVED,
          `Thu hồi điểm thưởng KYC do hồ sơ bị từ chối/hủy duyệt: ${trimmedReason}`
        );
        trustScoreRevocation = {
          applied: true,
          action: TRUST_ACTION_KYC_REVOKED,
          pointDeducted: TRUST_BONUS_KYC_APPROVED,
          newScore
        };
      }
    }
  } catch (tsErr) {
    console.warn('Could not revoke KYC trust score bonus:', tsErr.message);
  }

  return {
    message: 'KYC verification rejected successfully',
    verification: updatedVerification,
    trustScore: trustScoreRevocation
  };
};

module.exports = {
  ensureAdmin,
  listVerifications,
  getVerificationDetail,
  approveVerification,
  rejectVerification
};
