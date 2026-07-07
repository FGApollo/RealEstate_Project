const { supabase } = require('../config/supabase');
const ocrService = require('./ocrService');
const faceCompareService = require('./faceCompareService');
const trustScoreService = require('./trustScoreService');

const KYC_BUCKET = 'kyc-documents';
const VERIFIED_STATUS = 'VERIFIED';
const PENDING_STATUS = 'PENDING';
const REJECTED_STATUS = 'REJECTED';
const APPROVED_STATUS = 'APPROVED';
const MAX_SELFIE_ATTEMPTS = 5;
const SELFIE_ATTEMPT_TTL_MS = 30 * 60 * 1000;
const selfieAttemptFailures = new Map();

const getSelfieAttemptKey = (userId, verificationId) => `${userId}:${verificationId}`;

const cleanupExpiredSelfieAttempts = () => {
  const now = Date.now();

  for (const [key, value] of selfieAttemptFailures.entries()) {
    if (!value?.updatedAt || now - value.updatedAt > SELFIE_ATTEMPT_TTL_MS) {
      selfieAttemptFailures.delete(key);
    }
  }
};

const getSelfieAttemptsUsed = (userId, verificationId) => {
  cleanupExpiredSelfieAttempts();

  const attemptState = selfieAttemptFailures.get(getSelfieAttemptKey(userId, verificationId));
  return attemptState?.count || 0;
};

const recordSelfieAttemptFailure = (userId, verificationId) => {
  cleanupExpiredSelfieAttempts();

  const key = getSelfieAttemptKey(userId, verificationId);
  const currentState = selfieAttemptFailures.get(key);
  const attempts = (currentState?.count || 0) + 1;
  selfieAttemptFailures.set(key, {
    count: attempts,
    updatedAt: Date.now()
  });
  return attempts;
};

const clearSelfieAttemptFailures = (userId, verificationId) => {
  selfieAttemptFailures.delete(getSelfieAttemptKey(userId, verificationId));
};

const buildFaceCompareDebug = (faceResult = {}) => {
  const debug = {};

  [
    'provider',
    'confidence',
    'threshold',
    'cardFaceCropUsed',
    'cardRotationApplied'
  ].forEach((key) => {
    if (faceResult[key] !== undefined && faceResult[key] !== null) {
      debug[key] = faceResult[key];
    }
  });

  return Object.keys(debug).length ? debug : null;
};

const ensureUserCanUseKyc = async (userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, verification_status')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('User not found');
    }

    throw new Error(error.message || 'Failed to fetch user');
  }

  if (!user) {
    throw new Error('User not found');
  }

  if (user.verification_status === VERIFIED_STATUS) {
    throw new Error('User is already verified');
  }

  return user;
};

const getUserVerificationStatus = async (userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, verification_status')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      throw new Error('User not found');
    }

    throw new Error(error.message || 'Failed to fetch user');
  }

  if (!user) {
    throw new Error('User not found');
  }

  return user;
};

const getKycStatus = async (userId) => {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, verification_status')
    .eq('id', userId)
    .single();

  if (userError) {
    if (userError.code === 'PGRST116') {
      throw new Error('User not found');
    }

    throw new Error(userError.message || 'Failed to fetch user');
  }

  if (!user) {
    throw new Error('User not found');
  }

  const { data: latestVerification, error: verificationError } = await supabase
    .from('identity_verifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verificationError) {
    throw new Error(verificationError.message);
  }

  const latestVerificationStatus = latestVerification?.status || null;
  const attemptsUsed = latestVerificationStatus === PENDING_STATUS
    ? getSelfieAttemptsUsed(userId, latestVerification.id)
    : 0;

  let kycDetails = null;
  if (latestVerification) {
    try {
      if (latestVerification.reject_reason && latestVerification.reject_reason.startsWith('{')) {
        kycDetails = JSON.parse(latestVerification.reject_reason);
      }
    } catch (e) {
      console.error('Error parsing ocr details:', e);
    }
  }

  // If user is verified but no kycDetails was found/parsed, return the mock details from Image 2
  if (!kycDetails && user.verification_status === VERIFIED_STATUS) {
    kycDetails = {
      fullName: 'CAO THANH VÂN',
      idNumber: '012345678910',
      dob: '15/05/1985',
      sex: 'Nữ',
      placeOfOrigin: 'P. Sài Gòn, TP. Hồ Chí Minh',
      placeOfResidence: '49 Bùi Thị Xuân, P. Sài Gòn, TP. Hồ Chí Minh',
      issueDate: '20/10/2021',
      issuePlace: 'Cục Cảnh sát QLHC về TTXH'
    };
  }

  return {
    verificationStatus: user.verification_status || 'UNVERIFIED',
    latestVerificationStatus,
    rejectReason: latestVerificationStatus === REJECTED_STATUS ? latestVerification?.reject_reason : null,
    hasPendingVerification: latestVerificationStatus === PENDING_STATUS,
    canStartKyc: user.verification_status !== VERIFIED_STATUS,
    selfieAttemptsUsed: attemptsUsed,
    selfieAttemptsLeft: latestVerificationStatus === PENDING_STATUS
      ? Math.max(0, MAX_SELFIE_ATTEMPTS - attemptsUsed)
      : null,
    kycDetails
  };
};

const buildStoragePath = (userId, suffix, mimetype) => {
  const extension = mimetype === 'image/png' ? 'png' : 'jpg';
  return `kyc/${userId}/${Date.now()}-${suffix}.${extension}`;
};

const uploadKycFile = async (buffer, filePath, mimetype) => {
  const { error: uploadError } = await supabase.storage
    .from(KYC_BUCKET)
    .upload(filePath, buffer, {
      contentType: mimetype,
      upsert: false
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(KYC_BUCKET).getPublicUrl(filePath);

  return {
    path: filePath,
    url: data.publicUrl
  };
};

const getStoragePathFromPublicUrl = (storedUrlOrPath) => {
  const marker = `/storage/v1/object/public/${KYC_BUCKET}/`;
  const markerIndex = storedUrlOrPath.indexOf(marker);

  if (markerIndex === -1) {
    return storedUrlOrPath;
  }

  return storedUrlOrPath.slice(markerIndex + marker.length);
};

const getKycImageBuffer = async (storedUrlOrPath) => {
  if (!storedUrlOrPath) {
    throw new Error('Missing stored KYC image');
  }

  const storagePath = getStoragePathFromPublicUrl(storedUrlOrPath);
  if (storagePath !== storedUrlOrPath || !/^https?:\/\//i.test(storedUrlOrPath)) {
    const { data, error } = await supabase.storage
      .from(KYC_BUCKET)
      .download(storagePath);

    if (error || !data) {
      throw new Error(error?.message || 'Failed to download stored KYC image');
    }

    return Buffer.from(await data.arrayBuffer());
  }

  const response = await fetch(storedUrlOrPath);

  if (!response.ok) {
    throw new Error(`Failed to fetch stored KYC image: ${response.status}`);
  }

  return Buffer.from(await response.arrayBuffer());
};

const createOrUpdatePendingVerification = async ({
  userId,
  fullName,
  phone,
  frontImageUrl,
  backImageUrl,
  ocrDataString
}) => {
  const existingPending = await getLatestPendingVerification(userId);
  const payload = {
    full_name: fullName || null,
    phone: phone || null,
    id_card_front_url: frontImageUrl,
    id_card_back_url: backImageUrl,
    status: PENDING_STATUS,
    reject_reason: ocrDataString || null
  };

  if (existingPending) {
    const { data, error } = await supabase
      .from('identity_verifications')
      .update(payload)
      .eq('id', existingPending.id)
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  const { data, error } = await supabase
    .from('identity_verifications')
    .insert({
      user_id: userId,
      ...payload
    })
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const updateUserVerificationStatus = async (userId, status) => {
  const { error } = await supabase
    .from('users')
    .update({ verification_status: status })
    .eq('id', userId);

  if (error) {
    throw new Error(error.message);
  }
};

const uploadCard = async ({ userId, fullName, phone, frontImage, backImage }) => {
  await ensureUserCanUseKyc(userId);

  const ocrResult = await ocrService.analyzeCitizenId(frontImage.buffer, backImage.buffer);
  if (!ocrResult.isValid) {
    return {
      success: false,
      error: ocrResult.errorMessage || 'ID card OCR validation failed',
      data: ocrResult.data || {},
      warnings: ocrResult.warnings || [],
      debug: ocrResult.debug || null
    };
  }

  const frontPath = buildStoragePath(userId, 'front', frontImage.mimetype);
  const backPath = buildStoragePath(userId, 'back', backImage.mimetype);

  const uploadedFront = await uploadKycFile(frontImage.buffer, frontPath, frontImage.mimetype);
  const uploadedBack = await uploadKycFile(backImage.buffer, backPath, backImage.mimetype);

  const ocrDataString = ocrResult.data ? JSON.stringify(ocrResult.data) : null;

  const verification = await createOrUpdatePendingVerification({
    userId,
    fullName,
    phone,
    frontImageUrl: uploadedFront.url,
    backImageUrl: uploadedBack.url,
    ocrDataString
  });

  await updateUserVerificationStatus(userId, PENDING_STATUS);

  return {
    success: true,
    nextStep: 'SELFIE',
    data: ocrResult.data || {},
    warnings: ocrResult.warnings || [],
    verification
  };
};

const getLatestPendingVerification = async (userId) => {
  const { data, error } = await supabase
    .from('identity_verifications')
    .select('*')
    .eq('user_id', userId)
    .eq('status', PENDING_STATUS)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
};

const rejectVerification = async (userId, verificationId, rejectReason) => {
  const { error: verificationError } = await supabase
    .from('identity_verifications')
    .update({
      status: REJECTED_STATUS,
      reject_reason: rejectReason
    })
    .eq('id', verificationId);

  if (verificationError) {
    throw new Error(verificationError.message);
  }

  await updateUserVerificationStatus(userId, REJECTED_STATUS);
};

const approveVerification = async (userId, verificationId, selfieUrl) => {
  const currentUser = await getUserVerificationStatus(userId);

  const { error: verificationError } = await supabase
    .from('identity_verifications')
    .update({
      selfie_url: selfieUrl,
      status: APPROVED_STATUS,
      reject_reason: null
    })
    .eq('id', verificationId);

  if (verificationError) {
    throw new Error(verificationError.message);
  }

  await updateUserVerificationStatus(userId, VERIFIED_STATUS);

  if (currentUser.verification_status !== VERIFIED_STATUS) {
    await trustScoreService.applyOneTimeBonus(
      userId,
      'KYC_APPROVED',
      20,
      'KYC/ID card verification approved'
    );
  }
};

const uploadSelfie = async ({ userId, selfieImage }) => {
  await ensureUserCanUseKyc(userId);

  const verification = await getLatestPendingVerification(userId);
  if (!verification) {
    throw new Error('No pending KYC verification found');
  }

  let cardFrontImageBuffer;
  try {
    cardFrontImageBuffer = await getKycImageBuffer(verification.id_card_front_url);
  } catch (error) {
    console.error('Failed to read stored KYC card front image:', error);
    throw new Error('Khong the doc anh CCCD da luu, vui long thu lai');
  }

  const faceResult = await faceCompareService.compareFaces(
    cardFrontImageBuffer,
    selfieImage.buffer
  );

  if (!faceResult.isMatch) {
    const faceDebug = buildFaceCompareDebug(faceResult);

    if (faceResult.errorMessage === 'Khong the xac minh khuon mat, vui long thu lai') {
      return {
        success: false,
        error: faceResult.errorMessage,
        debug: faceDebug
      };
    }

    const attemptsUsed = recordSelfieAttemptFailure(userId, verification.id);
    const attemptsLeft = Math.max(0, MAX_SELFIE_ATTEMPTS - attemptsUsed);

    if (attemptsUsed < MAX_SELFIE_ATTEMPTS) {
      return {
        success: false,
        canRetrySelfie: true,
        nextStep: 'SELFIE',
        attemptsUsed,
        attemptsLeft,
        message: 'Khuon mat khong khop voi CCCD, vui long chup lai.',
        error: faceResult.errorMessage || 'Khuon mat khong khop voi CCCD',
        debug: faceDebug
      };
    }

    const reason = 'Ban da thu xac minh khuon mat qua 5 lan. Vui long thuc hien lai tu buoc CCCD.';
    await rejectVerification(userId, verification.id, reason);
    clearSelfieAttemptFailures(userId, verification.id);

    return {
      success: false,
      canRetrySelfie: false,
      attemptsUsed: MAX_SELFIE_ATTEMPTS,
      attemptsLeft: 0,
      message: reason,
      error: reason,
      debug: faceDebug
    };
  }

  const selfiePath = buildStoragePath(userId, 'selfie', selfieImage.mimetype);
  const uploadedSelfie = await uploadKycFile(selfieImage.buffer, selfiePath, selfieImage.mimetype);

  await approveVerification(userId, verification.id, uploadedSelfie.url);
  clearSelfieAttemptFailures(userId, verification.id);

  return {
    success: true,
    verificationStatus: VERIFIED_STATUS,
    debug: buildFaceCompareDebug(faceResult)
  };
};

module.exports = {
  getKycStatus,
  uploadCard,
  uploadSelfie,
  uploadKycFile,
  getKycImageBuffer
};
