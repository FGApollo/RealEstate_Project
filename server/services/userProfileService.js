const bcrypt = require('bcrypt');
const { supabase } = require('../config/supabase');
const trustScoreService = require('./trustScoreService');
const { validatePassword, normalizeVietnamPhone } = require('./registrationValidation');

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
    .select('id, name, email, phone, role, avatar, trust_score, verification_status, created_at, password')
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
    const trimmedName = String(name || '').trim();
    if (!trimmedName || trimmedName.length > 120) {
      throw new Error('Họ và tên phải từ 1 đến 120 ký tự');
    }
    updates.name = trimmedName;
  }

  if (phone !== undefined) {
    const trimmedPhone = String(phone || '').trim();
    if (trimmedPhone === '') {
      updates.phone = null;
    } else {
      const normalized = normalizeVietnamPhone(trimmedPhone);
      if (!normalized) {
        throw new Error('Số điện thoại không hợp lệ (định dạng 10 số Việt Nam)');
      }
      updates.phone = normalized;
    }
  }

  const { data: updated, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select('id, name, email, phone, role, avatar, trust_score, verification_status, created_at')
    .single();

  if (error) {
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
    if (!currentPassword) {
      throw new Error('Vui lòng nhập mật khẩu hiện tại');
    }
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new Error('Mật khẩu hiện tại không chính xác');
    }
  }

  // Validate new password strength
  const validationError = validatePassword(newPassword);
  if (validationError) {
    throw new Error(validationError);
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);

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

  return { success: true, message: 'Đổi mật khẩu thành công' };
};

module.exports = {
  uploadAvatar,
  getUserProfile,
  updateUserProfile,
  changeUserPassword
};
