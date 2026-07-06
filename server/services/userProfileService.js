const { supabase } = require('../config/supabase');
const trustScoreService = require('./trustScoreService');

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

  let profileBonus = {
    applied: false,
    message: 'Profile completeness bonus was not checked'
  };

  if (trustScoreService?.applyProfileCompletenessBonus) {
    profileBonus = await trustScoreService.applyProfileCompletenessBonus(userId);
  }

  return {
    avatar: publicUrl,
    profileBonus
  };
};

module.exports = {
  uploadAvatar
};
