const { supabase } = require('../config/supabase');
const { positiveId, badRequest } = require('./businessValidation');

const getFavorites = async (userId) => {
  const { data: favorites, error: favsError } = await supabase
    .from('favorites')
    .select('id, property_id')
    .eq('user_id', userId);

  if (favsError) {
    throw new Error(favsError.message);
  }

  if (!favorites || favorites.length === 0) {
    return [];
  }

  const propertyIds = favorites.map(f => f.property_id);

  const { data: properties, error: propsError } = await supabase
    .from('properties')
    .select(`
      *,
      property_features(feature_name),
      property_images(image_url),
      lifestyle_tags(tag_name),
      owner:users!owner_id(name, role, avatar, trust_score, created_at)
    `)
    .in('id', propertyIds)
    .eq('status', 'AVAILABLE')
    .or('is_hidden.is.null,is_hidden.eq.false');

  if (propsError) {
    throw new Error(propsError.message);
  }

  return properties.filter((property) => Number(property.owner?.trust_score ?? 50) > 30).map(prop => {
    const fav = favorites.find(f => f.property_id === prop.id);
    return {
      ...prop,
      favorite_id: fav ? fav.id : null
    };
  });
};

const addFavorite = async (userId, propertyId) => {
  propertyId = positiveId(propertyId, 'propertyId');
  const { data: property, error: propertyError } = await supabase.from('properties')
    .select('id, status, is_hidden, owner:users!owner_id(trust_score)')
    .eq('id', propertyId).maybeSingle();
  if (propertyError) throw new Error(propertyError.message);
  if (!property || property.status !== 'AVAILABLE' || property.is_hidden === true
    || Number(property.owner?.trust_score ?? 50) <= 30) {
    throw Object.assign(badRequest('Property not found.'), { statusCode: 404 });
  }
  const { data: existing, error: checkError } = await supabase
    .from('favorites')
    .select('id')
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .limit(1);

  if (checkError) throw new Error(checkError.message);
  if (existing && existing.length > 0) {
    return existing[0];
  }

  const { data, error } = await supabase
    .from('favorites')
    .insert({ user_id: userId, property_id: propertyId })
    .select();

  if (error) {
    throw new Error(error.message);
  }
  await recordFavoriteEvent(userId, propertyId, 'FAVORITE');
  return data[0];
};

const recordFavoriteEvent = async (userId, propertyId, action) => {
  const { error } = await supabase.from('user_property_events').insert({
    user_id: userId,
    property_id: propertyId,
    action
  });
  if (error) console.error('Could not persist favorite recommendation signal:', error.message);
};

const removeFavorite = async (userId, propertyId) => {
  propertyId = positiveId(propertyId, 'propertyId');
  const { data, error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .select();

  if (error) {
    throw new Error(error.message);
  }
  if (data?.length) await recordFavoriteEvent(userId, propertyId, 'UNFAVORITE');
  return data;
};

module.exports = {
  getFavorites,
  addFavorite,
  removeFavorite
};
