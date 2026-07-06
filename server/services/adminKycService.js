const fs = require('fs');
const path = require('path');
const { supabase } = require('../config/supabase');

const ADMIN_ROLE = 'ADMIN';
const VERIFIED_STATUS = 'VERIFIED';
const PENDING_STATUS = 'PENDING';
const REJECTED_STATUS = 'REJECTED';
const APPROVED_STATUS = 'APPROVED';
const TRUST_ACTION_KYC_APPROVED = 'KYC_APPROVED';
const TRUST_BONUS_KYC_APPROVED = 20;
const TRUST_BONUS_REASON = 'KYC/ID card verification approved by admin';

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

const getTime = (value) => {
  if (!value) {
    return null;
  }

  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : time;
};

const compareLatestVerification = (a, b) => {
  const aPrimaryTime = getTime(a.updated_at) ?? getTime(a.created_at) ?? 0;
  const bPrimaryTime = getTime(b.updated_at) ?? getTime(b.created_at) ?? 0;

  if (aPrimaryTime !== bPrimaryTime) {
    return bPrimaryTime - aPrimaryTime;
  }

  const aCreatedTime = getTime(a.created_at) ?? 0;
  const bCreatedTime = getTime(b.created_at) ?? 0;

  if (aCreatedTime !== bCreatedTime) {
    return bCreatedTime - aCreatedTime;
  }

  return Number(b.id) - Number(a.id);
};

const isMissingTableError = (error) => (
  error?.code === '42P01'
  || error?.code === 'PGRST205'
  || /trust_score_logs/i.test(error?.message || '')
);

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

const getRejectedVerifications = async (adminId) => {
  await ensureAdmin(adminId);

  const { data: verifications, error } = await supabase
    .from('identity_verifications')
    .select('*')
    .order('updated_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .order('id', { ascending: false });

  if (error) {
    throw new Error(error.message || 'Failed to fetch verifications');
  }

  const latestByUser = new Map();

  [...(verifications || [])]
    .sort(compareLatestVerification)
    .forEach((verification) => {
      if (!latestByUser.has(verification.user_id)) {
        latestByUser.set(verification.user_id, verification);
      }
    });

  const rejectedLatestVerifications = [...latestByUser.values()]
    .filter((verification) => verification.status === REJECTED_STATUS)
    .sort(compareLatestVerification);

  return attachUsers(rejectedLatestVerifications);
};

const getVerificationDetail = async (adminId, verificationId) => {
  await ensureAdmin(adminId);

  const verification = await fetchVerificationById(verificationId);
  const [verificationWithUser] = await attachUsers([verification]);

  return verificationWithUser;
};

const applyTrustScoreWithExistingService = async (userId) => {
  if (typeof trustScoreService?.applyOneTimeBonus !== 'function') {
    return null;
  }

  const result = await trustScoreService.applyOneTimeBonus(
    userId,
    TRUST_ACTION_KYC_APPROVED,
    TRUST_BONUS_KYC_APPROVED,
    TRUST_BONUS_REASON
  );

  return {
    applied: result?.applied !== false,
    action: TRUST_ACTION_KYC_APPROVED,
    result
  };
};

const applyTrustScoreDirectly = async (userId) => {
  const { data: existingLog, error: existingLogError } = await supabase
    .from('trust_score_logs')
    .select('id')
    .eq('user_id', userId)
    .eq('action', TRUST_ACTION_KYC_APPROVED)
    .limit(1)
    .maybeSingle();

  if (existingLogError) {
    if (isMissingTableError(existingLogError)) {
      return {
        applied: false,
        action: TRUST_ACTION_KYC_APPROVED,
        skipped: true,
        reason: 'trust_score_logs table is not available'
      };
    }

    throw new Error(existingLogError.message || 'Failed to check trust score logs');
  }

  if (existingLog) {
    return {
      applied: false,
      action: TRUST_ACTION_KYC_APPROVED,
      reason: 'KYC_APPROVED bonus already applied'
    };
  }

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, trust_score')
    .eq('id', userId)
    .single();

  if (userError) {
    throw new Error(userError.message || 'Failed to fetch user trust score');
  }

  const oldScore = Number(user.trust_score || 0);
  const newScore = oldScore + TRUST_BONUS_KYC_APPROVED;

  const { error: updateUserError } = await supabase
    .from('users')
    .update({
      trust_score: newScore,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (updateUserError) {
    throw new Error(updateUserError.message || 'Failed to update trust score');
  }

  const { error: insertLogError } = await supabase
    .from('trust_score_logs')
    .insert({
      user_id: userId,
      action: TRUST_ACTION_KYC_APPROVED,
      point_change: TRUST_BONUS_KYC_APPROVED,
      old_score: oldScore,
      new_score: newScore,
      reason: TRUST_BONUS_REASON,
      related_property_id: null,
      related_report_id: null
    });

  if (insertLogError) {
    throw new Error(insertLogError.message || 'Failed to create trust score log');
  }

  return {
    applied: true,
    action: TRUST_ACTION_KYC_APPROVED,
    pointChange: TRUST_BONUS_KYC_APPROVED,
    oldScore,
    newScore
  };
};

const applyKycApprovedTrustScore = async (userId) => {
  const serviceResult = await applyTrustScoreWithExistingService(userId);

  if (serviceResult) {
    return serviceResult;
  }

  return applyTrustScoreDirectly(userId);
};

const approveVerification = async (adminId, verificationId) => {
  const admin = await ensureAdmin(adminId);
  const verification = await fetchVerificationById(verificationId);

  if (verification.status === APPROVED_STATUS) {
    return {
      message: 'KYC verification is already approved',
      verification: {
        id: verification.id,
        status: verification.status,
        user_id: verification.user_id
      },
      trustScore: {
        applied: false,
        action: TRUST_ACTION_KYC_APPROVED,
        reason: 'Verification was already approved'
      },
      applied: false
    };
  }

  if (![REJECTED_STATUS, PENDING_STATUS].includes(verification.status)) {
    throw new Error('Only rejected or pending verifications can be approved');
  }

  const now = new Date().toISOString();
  const { data: updatedVerification, error: verificationError } = await supabase
    .from('identity_verifications')
    .update({
      status: APPROVED_STATUS,
      reject_reason: null,
      reviewed_by: admin.id,
      reviewed_at: now,
      updated_at: now
    })
    .eq('id', verification.id)
    .select('id, status, user_id')
    .single();

  if (verificationError) {
    throw new Error(verificationError.message || 'Failed to approve verification');
  }

  const { error: userError } = await supabase
    .from('users')
    .update({
      verification_status: VERIFIED_STATUS,
      updated_at: now
    })
    .eq('id', verification.user_id);

  if (userError) {
    throw new Error(userError.message || 'Failed to update user verification status');
  }

  let trustScore;
  try {
    trustScore = await applyKycApprovedTrustScore(verification.user_id);
  } catch (error) {
    trustScore = {
      applied: false,
      action: TRUST_ACTION_KYC_APPROVED,
      skipped: true,
      error: error.message || 'Failed to apply trust score bonus'
    };
  }

  return {
    message: 'KYC verification approved successfully',
    verification: updatedVerification,
    trustScore,
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

  return {
    message: 'KYC verification rejected successfully',
    verification: updatedVerification
  };
};

module.exports = {
  ensureAdmin,
  getRejectedVerifications,
  getVerificationDetail,
  approveVerification,
  rejectVerification
};
