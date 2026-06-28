const { supabase } = require('../config/supabase');

const getProperties = async () => {
  const { data, error } = await supabase
    .from('properties')
    .select(`
      *,
      property_features(feature_name),
      property_images(image_url),
      lifestyle_tags(tag_name),
      owner:users!owner_id(name, role, avatar, trust_score, created_at)
    `);

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

module.exports = {
  getProperties
};
