const sharp = require('sharp');
const { supabase } = require('../config/supabase');
const ocrService = require('./ocrService');
const faceCompareService = require('./faceCompareService');
const { KYC_BUCKET, getKycImageBuffer, getKycStoragePath } = require('./kycStorage');
const { isNameMismatch } = require('./kycNamePolicy');

const SELFIE_LIMIT_REASON = 'Bạn đã thử xác minh khuôn mặt quá 5 lần. Vui lòng thực hiện lại từ bước CCCD.';
const NAME_REVIEW_MESSAGE = 'Hồ sơ cần quản trị viên xác nhận vì tên trên CCCD khác tên đã khai.';
const FACE_REVIEW_MESSAGE = 'Hệ thống so khớp khuôn mặt đang gặp sự cố. Hồ sơ của bạn đã được chuyển cho quản trị viên duyệt.';
// Hồ sơ PENDING đã có selfie chỉ còn chờ quản trị viên: tên lệch, hoặc dịch vụ so khớp khuôn mặt lỗi.
// Chưa so được khuôn mặt là lý do nặng hơn (danh tính chưa được máy xác nhận) nên được ưu tiên khi báo người dùng.
const reviewReasonOf = (verification) => (verification?.face_check_unavailable ? 'FACE_CHECK_UNAVAILABLE' : 'NAME_MISMATCH');
const reviewMessageOf = (reason) => (reason === 'NAME_MISMATCH' ? NAME_REVIEW_MESSAGE : FACE_REVIEW_MESSAGE);

const VERIFIED_STATUS = 'VERIFIED';
const PENDING_STATUS = 'PENDING';
const REJECTED_STATUS = 'REJECTED';
const APPROVED_STATUS = 'APPROVED';
const MAX_SELFIE_ATTEMPTS = 5;

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

// Chi tiết so khớp chỉ phục vụ gỡ lỗi; không trả cho client ở production.
const debugField = (faceResult) => {
  if (process.env.NODE_ENV === 'production') return {};
  const debug = buildFaceCompareDebug(faceResult);
  return debug ? { debug } : {};
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
    ? Number(latestVerification.selfie_attempts || 0)
    : 0;

  let kycDetails = null;
  if (latestVerification) {
    if (latestVerification.ocr_data && typeof latestVerification.ocr_data === 'object') {
      kycDetails = latestVerification.ocr_data;
    } else if (typeof latestVerification.ocr_data === 'string') {
      try {
        kycDetails = JSON.parse(latestVerification.ocr_data);
      } catch (e) {
        console.error('Error parsing ocr_data string:', e);
      }
    } else if (latestVerification.reject_reason && latestVerification.reject_reason.startsWith('{')) {
      try {
        kycDetails = JSON.parse(latestVerification.reject_reason);
      } catch (e) {
        console.error('Error parsing legacy ocr details:', e);
      }
    }
  }

  // If user is verified, ensure key fields have reasonable fallbacks
  if (user.verification_status === VERIFIED_STATUS) {
    if (!kycDetails) {
      kycDetails = {
        fullName: latestVerification?.full_name || user.name || 'Người dùng đã xác minh',
        idNumber: latestVerification?.id_number || '---',
        dob: '---',
        sex: '---',
        placeOfOrigin: '---',
        placeOfResidence: '---',
        issueDate: '---',
        issuePlace: '---'
      };
    } else {
      if (!kycDetails.fullName) kycDetails.fullName = latestVerification?.full_name || user.name;
      if (!kycDetails.idNumber) kycDetails.idNumber = latestVerification?.id_number || '---';
    }
  }

  // Hồ sơ PENDING đã lưu selfie = chờ quản trị viên duyệt tay (tên lệch, hoặc không so khớp khuôn mặt tự động được).
  const awaitingAdminReview = Boolean(
    latestVerificationStatus === PENDING_STATUS
    && latestVerification?.selfie_url
  );

  const hasCardUploaded = Boolean(
    latestVerificationStatus === PENDING_STATUS &&
    latestVerification?.id_card_front_url &&
    latestVerification?.id_card_back_url
  );

  return {
    verificationStatus: user.verification_status || 'UNVERIFIED',
    latestVerificationStatus,
    rejectReason: latestVerificationStatus === REJECTED_STATUS ? latestVerification?.reject_reason : null,
    hasPendingVerification: latestVerificationStatus === PENDING_STATUS,
    hasCardUploaded,
    awaitingAdminReview,
    reviewReason: awaitingAdminReview ? reviewReasonOf(latestVerification) : null,
    nameMismatch: latestVerificationStatus === PENDING_STATUS ? Boolean(latestVerification?.name_mismatch) : false,
    pendingStep: (latestVerificationStatus === PENDING_STATUS && hasCardUploaded) ? 3 : 1,
    canStartKyc: user.verification_status !== VERIFIED_STATUS,
    selfieAttemptsUsed: attemptsUsed,
    selfieAttemptsLeft: latestVerificationStatus === PENDING_STATUS
      ? Math.max(0, MAX_SELFIE_ATTEMPTS - attemptsUsed)
      : null,
    kycDetails: user.verification_status === VERIFIED_STATUS ? kycDetails : null
  };
};

const buildStoragePath = (userId, suffix, mimetype) => {
  const extension = mimetype === 'image/png' ? 'png' : mimetype === 'image/webp' ? 'webp' : 'jpg';
  return `kyc/${userId}/${Date.now()}-${suffix}.${extension}`;
};

// Ảnh giấy tờ / selfie chỉ cần đủ nét để người duyệt đọc và so khuôn mặt: lưu JPEG tối đa 1600px thay vì
// ảnh gốc (PNG chụp màn hình có thể 3–5MB). Nhỏ hơn ~10 lần nên tải lên nhanh hơn hẳn; OCR vẫn đọc ảnh gốc.
const KYC_STORED_MAX_SIDE = 1600;
const compressForStorage = async (buffer) => {
  try {
    return await sharp(buffer)
      .rotate()
      .resize({ width: KYC_STORED_MAX_SIDE, height: KYC_STORED_MAX_SIDE, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer();
  } catch {
    return null;
  }
};

const storeKycImage = async (userId, suffix, image) => {
  const compressed = await compressForStorage(image.buffer);
  const buffer = compressed || image.buffer;
  const mimetype = compressed ? 'image/jpeg' : image.mimetype;
  return uploadKycFile(buffer, buildStoragePath(userId, suffix, mimetype), mimetype);
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

  return {
    path: filePath,
    url: filePath
  };
};

const createOrUpdatePendingVerification = async ({
  userId,
  fullName,
  phone,
  frontImageUrl,
  backImageUrl,
  ocrData,
  idNumber,
  declaredName,
  nameMismatch
}) => {
  const existingPending = await getLatestPendingVerification(userId);
  const now = new Date().toISOString();
  const payload = {
    full_name: fullName || null,
    phone: phone || null,
    id_card_front_url: frontImageUrl,
    id_card_back_url: backImageUrl,
    status: PENDING_STATUS,
    ocr_data: ocrData || null,
    id_number: idNumber || null,
    declared_name: declaredName || null,
    name_mismatch: Boolean(nameMismatch),
    // Gửi lại CCCD là bắt đầu lại từ đầu: bỏ cờ "chưa so khớp khuôn mặt" của lần trước.
    face_check_unavailable: false,
    selfie_url: null,
    reject_reason: null,
    selfie_attempts: 0,
    updated_at: now
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
    .update({ 
      verification_status: status,
      updated_at: new Date().toISOString()
    })
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
      error: ocrResult.errorMessage || ocrResult.hardError || 'Không đọc được đủ thông tin trên thẻ CCCD. Vui lòng chụp rõ nét cả mặt trước và mặt sau.',
      data: ocrResult.data || {},
      warnings: ocrResult.warnings || []
    };
  }

  const ocrData = ocrResult.data || {};
  let idNumber = ocrResult.data?.idNumber || null;

  // Chống gian lận: Kiểm tra số CCCD này đã được tài khoản khác xác minh thành công chưa
  if (idNumber) {
    const { data: existingVerified, error: checkError } = await supabase
      .from('identity_verifications')
      .select('id, user_id')
      .eq('id_number', idNumber)
      .eq('status', APPROVED_STATUS)
      .neq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (checkError) throw new Error('Failed to check existing identity verification');
    if (existingVerified) {
      return {
        success: false,
        error: 'Số CCCD này đã được sử dụng và xác minh cho một tài khoản khác.'
      };
    }
  }

  const [uploadedFront, uploadedBack] = await Promise.all([
    storeKycImage(userId, 'front', frontImage),
    storeKycImage(userId, 'back', backImage)
  ]);

  // Tên pháp lý là tên đọc được trên CCCD; tên tự khai lưu riêng để quản trị viên đối chiếu.
  const ocrName = (ocrData.fullName || '').trim();
  const declaredName = (fullName || '').trim();
  const nameMismatch = isNameMismatch(ocrName, declaredName);

  const mergedOcrData = {
    ...ocrData,
    fullName: ocrName || declaredName || null,
    phone: phone || null,
    ocrPassed: Boolean(ocrResult.isValid)
  };

  const verification = await createOrUpdatePendingVerification({
    userId,
    fullName: ocrName || declaredName,
    declaredName,
    nameMismatch,
    phone,
    frontImageUrl: uploadedFront.url,
    backImageUrl: uploadedBack.url,
    ocrData: mergedOcrData,
    idNumber
  });

  await updateUserVerificationStatus(userId, PENDING_STATUS);

  return {
    success: true,
    nextStep: 'SELFIE',
    data: mergedOcrData,
    nameMismatch,
    warnings: [
      ...(ocrResult.warnings || []),
      ...(nameMismatch ? ['Tên trên CCCD khác tên bạn đã khai; hồ sơ sẽ cần quản trị viên xác nhận.'] : [])
    ],
    verification: { id: verification.id, status: verification.status }
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
  const now = new Date().toISOString();
  const { error: verificationError } = await supabase
    .from('identity_verifications')
    .update({
      status: REJECTED_STATUS,
      reject_reason: rejectReason,
      updated_at: now
    })
    .eq('id', verificationId);

  if (verificationError) {
    throw new Error(verificationError.message);
  }

  await updateUserVerificationStatus(userId, REJECTED_STATUS);
};

const approveVerification = async (userId, verification, selfieUrl) => {
  await getUserVerificationStatus(userId);
  const now = new Date().toISOString();

  const { data: approvedVerification, error: verificationError } = await supabase
    .from('identity_verifications')
    .update({
      selfie_url: selfieUrl,
      status: APPROVED_STATUS,
      reject_reason: null,
      updated_at: now
    })
    .eq('id', verification.id)
    .eq('user_id', userId)
    .eq('status', PENDING_STATUS)
    .eq('id_card_front_url', verification.id_card_front_url)
    .select('id')
    .maybeSingle();

  if (verificationError) {
    throw new Error(verificationError.message);
  }
  if (!approvedVerification) throw new Error('KYC verification changed; restart verification');

  await updateUserVerificationStatus(userId, VERIFIED_STATUS);

  // Note: Trust score bonus (+20đ) is claimed manually by the user, not granted automatically
};

// Lưu selfie của lần thử cuối để quản trị viên có ảnh đối chiếu khi xem hồ sơ bị từ chối.
const saveSelfieForReview = async (userId, verificationId, selfieImage, extraFields = {}) => {
  try {
    const uploaded = await storeKycImage(userId, 'selfie', selfieImage);
    const { error } = await supabase
      .from('identity_verifications')
      .update({ selfie_url: uploaded.url, updated_at: new Date().toISOString(), ...extraFields })
      .eq('id', verificationId)
      .eq('user_id', userId);
    if (error) throw new Error(error.message);
    return uploaded.url;
  } catch (error) {
    console.error('Could not store KYC selfie for review:', error.message);
    return null;
  }
};

const uploadSelfie = async ({ userId, selfieImage }) => {
  await ensureUserCanUseKyc(userId);

  const verification = await getLatestPendingVerification(userId);
  if (!verification) {
    throw new Error('No pending KYC verification found');
  }

  if (verification.selfie_url) {
    const reviewReason = reviewReasonOf(verification);
    return { success: true, pendingAdminReview: true, reviewReason, verificationStatus: PENDING_STATUS, message: reviewMessageOf(reviewReason) };
  }

  // Atomic DB reservation bounds provider calls across concurrent requests,
  // multiple server instances and process restarts. Missing migration fails closed.
  const { data: attemptsUsed, error: attemptError } = await supabase.rpc('reserve_kyc_selfie_attempt', {
    p_verification_id: verification.id, p_user_id: userId
  });
  if (attemptError) throw new Error('Failed to reserve KYC verification attempt');
  if (!Number.isInteger(attemptsUsed) || attemptsUsed < 1 || attemptsUsed > MAX_SELFIE_ATTEMPTS) {
    await saveSelfieForReview(userId, verification.id, selfieImage);
    await rejectVerification(userId, verification.id, SELFIE_LIMIT_REASON);
    return { success: false, canRetrySelfie: false, attemptsUsed: MAX_SELFIE_ATTEMPTS, attemptsLeft: 0, error: 'Vui lòng thực hiện lại từ bước CCCD.' };
  }

  let cardFrontImageBuffer;
  try {
    if (!getKycStoragePath(verification.id_card_front_url).startsWith(`kyc/${userId}/`)) throw new Error('Invalid KYC image owner');
    cardFrontImageBuffer = await getKycImageBuffer(verification.id_card_front_url);
  } catch (error) {
    console.error('Failed to read stored KYC card front image:', error);
    throw new Error('Không thể đọc ảnh CCCD đã lưu, vui lòng thử lại', { cause: error });
  }

  const faceResult = await faceCompareService.compareFaces(
    cardFrontImageBuffer,
    selfieImage.buffer
  );

  // Dịch vụ so khớp khuôn mặt lỗi / chưa cấu hình: không bắt người dùng thử lại hay từ chối hồ sơ,
  // mà lưu selfie và chuyển hồ sơ cho quản trị viên duyệt tay.
  if (!faceResult.isMatch && faceResult.errorCode === faceCompareService.FACE_VERIFY_UNAVAILABLE) {
    const storedSelfie = await saveSelfieForReview(userId, verification.id, selfieImage, { face_check_unavailable: true });
    if (!storedSelfie) throw new Error('Không thể lưu ảnh selfie, vui lòng thử lại');
    return {
      success: true,
      pendingAdminReview: true,
      reviewReason: 'FACE_CHECK_UNAVAILABLE',
      verificationStatus: PENDING_STATUS,
      message: FACE_REVIEW_MESSAGE,
      ...debugField(faceResult)
    };
  }

  if (!faceResult.isMatch) {
    if (attemptsUsed < MAX_SELFIE_ATTEMPTS) {
      return {
        success: false,
        canRetrySelfie: true,
        nextStep: 'SELFIE',
        message: 'Khuôn mặt không khớp với CCCD, vui lòng chụp lại.',
        attemptsUsed,
        attemptsLeft: MAX_SELFIE_ATTEMPTS - attemptsUsed,
        error: faceResult.errorMessage || 'Khuôn mặt không khớp với CCCD',
        ...debugField(faceResult)
      };
    }

    await saveSelfieForReview(userId, verification.id, selfieImage);
    await rejectVerification(userId, verification.id, SELFIE_LIMIT_REASON);

    return {
      success: false,
      canRetrySelfie: false,
      attemptsUsed: MAX_SELFIE_ATTEMPTS,
      attemptsLeft: 0,
      message: SELFIE_LIMIT_REASON,
      error: SELFIE_LIMIT_REASON,
      ...debugField(faceResult)
    };
  }

  if (verification.name_mismatch) {
    // Khuôn mặt khớp nhưng tên lệch: giữ PENDING, lưu selfie và chuyển cho quản trị viên duyệt tay.
    const storedSelfie = await saveSelfieForReview(userId, verification.id, selfieImage);
    if (!storedSelfie) throw new Error('Không thể lưu ảnh selfie, vui lòng thử lại');
    return {
      success: true,
      pendingAdminReview: true,
      reviewReason: 'NAME_MISMATCH',
      verificationStatus: PENDING_STATUS,
      message: NAME_REVIEW_MESSAGE,
      ...debugField(faceResult)
    };
  }

  const uploadedSelfie = await storeKycImage(userId, 'selfie', selfieImage);

  await approveVerification(userId, verification, uploadedSelfie.url);

  return {
    success: true,
    verificationStatus: VERIFIED_STATUS,
    ...debugField(faceResult)
  };
};

module.exports = {
  getKycStatus,
  uploadCard,
  uploadSelfie,
  uploadKycFile,
  getKycImageBuffer
};
