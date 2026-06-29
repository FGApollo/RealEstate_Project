const { supabase } = require('../config/supabase');
const ocrService = require('./ocrService');
const faceCompareService = require('./faceCompareService');

const KYC_BUCKET = 'kyc-documents';
const VERIFIED_STATUS = 'VERIFIED';
const PENDING_STATUS = 'PENDING';
const REJECTED_STATUS = 'REJECTED';
const APPROVED_STATUS = 'APPROVED';

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
    .select('id, status, reject_reason, created_at, updated_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (verificationError) {
    throw new Error(verificationError.message);
  }

  const latestVerificationStatus = latestVerification?.status || null;

  return {
    verificationStatus: user.verification_status || 'UNVERIFIED',
    latestVerificationStatus,
    rejectReason: latestVerification?.reject_reason || null,
    hasPendingVerification: latestVerificationStatus === PENDING_STATUS,
    canStartKyc: user.verification_status !== VERIFIED_STATUS
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

const createOrUpdatePendingVerification = async ({
  userId,
  fullName,
  phone,
  frontImageUrl,
  backImageUrl
}) => {
  const existingPending = await getLatestPendingVerification(userId);
  const payload = {
    full_name: fullName || null,
    phone: phone || null,
    id_card_front_url: frontImageUrl,
    id_card_back_url: backImageUrl,
    status: PENDING_STATUS,
    reject_reason: null
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
      error: ocrResult.errorMessage || 'ID card OCR validation failed'
    };
  }

  const frontPath = buildStoragePath(userId, 'front', frontImage.mimetype);
  const backPath = buildStoragePath(userId, 'back', backImage.mimetype);

  const uploadedFront = await uploadKycFile(frontImage.buffer, frontPath, frontImage.mimetype);
  const uploadedBack = await uploadKycFile(backImage.buffer, backPath, backImage.mimetype);

  const verification = await createOrUpdatePendingVerification({
    userId,
    fullName,
    phone,
    frontImageUrl: uploadedFront.url,
    backImageUrl: uploadedBack.url
  });

  await updateUserVerificationStatus(userId, PENDING_STATUS);

  return {
    success: true,
    nextStep: 'SELFIE',
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
};

const uploadSelfie = async ({ userId, selfieImage }) => {
  await ensureUserCanUseKyc(userId);

  const verification = await getLatestPendingVerification(userId);
  if (!verification) {
    throw new Error('No pending KYC verification found');
  }

  const faceResult = await faceCompareService.compareFaces(
    Buffer.from(verification.id_card_front_url || ''),
    selfieImage.buffer
  );

  if (!faceResult.isMatch) {
    const reason = faceResult.errorMessage || 'Khuôn mặt không khớp với CCCD';
    await rejectVerification(userId, verification.id, reason);

    return {
      success: false,
      error: reason
    };
  }

  const selfiePath = buildStoragePath(userId, 'selfie', selfieImage.mimetype);
  const uploadedSelfie = await uploadKycFile(selfieImage.buffer, selfiePath, selfieImage.mimetype);

  await approveVerification(userId, verification.id, uploadedSelfie.url);

  return {
    success: true,
    verificationStatus: VERIFIED_STATUS
  };
};

module.exports = {
  getKycStatus,
  uploadCard,
  uploadSelfie,
  uploadKycFile
};
