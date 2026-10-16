const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const trustScoreService = require('./trustScoreService');
const { validatePassword, normalizeVietnamPhone } = require('./registrationValidation');
const { normalizeImageFile } = require('./imageValidation');
const { revokeAllUserSessions } = require('./authSessionService');
const { badRequest } = require('./businessValidation');

const AVATAR_BUCKET = 'avatars';

const getAvatarExtension = (mimetype) => {
  if (mimetype === 'image/png') return 'png';
  if (mimetype === 'image/webp') return 'webp';
  return 'jpg';
};

const buildAvatarPath = (userId, mimetype) => {
  const extension = getAvatarExtension(mimetype);
  return `avatars/${userId}/${Date.now()}-avatar.${extension}`;
};

const ensureUserExists = async (userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, phone, avatar')
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

const updateUserAvatar = async (userId, publicUrl) => {
  const payload = {
    avatar: publicUrl,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('users')
    .update(payload)
    .eq('id', userId);

  if (!error) {
    return;
  }

  if (!String(error.message || '').toLowerCase().includes('updated_at')) {
    throw new Error(error.message);
  }

  const { error: fallbackError } = await supabase
    .from('users')
    .update({ avatar: publicUrl })
    .eq('id', userId);

  if (fallbackError) {
    throw new Error(fallbackError.message);
  }
};

const uploadAvatar = async (userId, file) => {
  await normalizeImageFile(file);
  await ensureUserExists(userId);

  const filePath = buildAvatarPath(userId, file.mimetype);
  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(filePath);
  const publicUrl = data.publicUrl;

  await updateUserAvatar(userId, publicUrl);

  return {
    avatar: publicUrl,
    profileBonus: {
      applied: false,
      message: 'Claim profile bonus manually in Trust Score modal'
    }
  };
};

const getUserProfile = async (userId) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email, phone, phone_verified, role, avatar, trust_score, verification_status, created_at, password')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new Error('User not found');
  }

  const { password, ...safeUser } = user;
  return {
    ...safeUser,
    has_password: Boolean(password)
  };
};

const updateUserProfile = async (userId, { name, phone }) => {
  const user = await ensureUserExists(userId);

  const updates = {
    updated_at: new Date().toISOString()
  };

  if (name !== undefined) {
    if (typeof name !== 'string' || /[\u0000-\u001f\u007f]/.test(name)) throw badRequest('Họ và tên không hợp lệ');
    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length > 120) {
      throw badRequest('Họ và tên phải từ 1 đến 120 ký tự');
    }
    updates.name = trimmedName;
  }

  if (phone !== undefined) {
    if (phone !== null && typeof phone !== 'string') throw badRequest('Số điện thoại không hợp lệ');
    const trimmedPhone = (phone || '').trim();
    if (trimmedPhone === '') {
      updates.phone = null;
    } else {
      const normalized = normalizeVietnamPhone(trimmedPhone);
      if (!normalized) {
        throw badRequest('Số điện thoại không hợp lệ (định dạng 10 số Việt Nam)');
      }
      updates.phone = normalized;
    }
    if (updates.phone !== (user.phone || null)) {
      updates.phone_verified = false;
      updates.phone_verified_at = null;
    }
  }

  let updateQuery = supabase
    .from('users')
    .update(updates)
    .eq('id', userId);
  if (phone !== undefined) {
    // An OTP verification may change the phone after our validation read.
    // Do not overwrite that newer phone using an older verification decision.
    updateQuery = user.phone == null ? updateQuery.is('phone', null) : updateQuery.eq('phone', user.phone);
  }
  const { data: updated, error } = await updateQuery
    .select('id, name, email, phone, phone_verified, role, avatar, trust_score, verification_status, created_at')
    .single();

  if (error) {
    if (error.code === 'PGRST116' && phone !== undefined) {
      throw Object.assign(badRequest('Thông tin tài khoản vừa thay đổi. Vui lòng tải lại rồi thử lại.'), { statusCode: 409 });
    }
    throw new Error(error.message);
  }

  return updated;
};

const changeUserPassword = async (userId, { currentPassword, newPassword }) => {
  const { data: user, error } = await supabase
    .from('users')
    .select('id, password')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw new Error('User not found');
  }

  // If user already has a password, verify current password
  if (user.password) {
    if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword, 'utf8') > 72) {
      throw badRequest('Vui lòng nhập mật khẩu hiện tại');
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw badRequest('Mật khẩu hiện tại không chính xác');
    }
  }

  // Validate new password strength
  const validationError = validatePassword(newPassword);
  if (validationError) {
    throw badRequest(validationError);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Revoke first so a revocation failure cannot leave a changed credential with
  // previously stolen sessions still active. This includes the current session.
  await revokeAllUserSessions(userId);

  const { error: updateError } = await supabase
    .from('users')
    .update({
      password: hashedPassword,
      updated_at: new Date().toISOString()
    })
    .eq('id', userId);

  if (updateError) {
    throw new Error(updateError.message);
  }

  await revokeAllUserSessions(userId);

  return { success: true, requiresLogin: true, message: 'Đổi mật khẩu thành công. Vui lòng đăng nhập lại.' };
};

module.exports = {
  uploadAvatar,
  getUserProfile,
  updateUserProfile,
  changeUserPassword
};
