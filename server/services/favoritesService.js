const { supabase } = require('../config/supabase');

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
      property_images(image_url)
    `)
    .in('id', propertyIds);

  if (propsError) {
    throw new Error(propsError.message);
  }

  return properties.map(prop => {
    const fav = favorites.find(f => f.property_id === prop.id);
    return {
      ...prop,
      favorite_id: fav ? fav.id : null
    };
  });
};

const addFavorite = async (userId, propertyId) => {
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
  return data[0];
};

const removeFavorite = async (userId, propertyId) => {
  const { data, error } = await supabase
    .from('favorites')
    .delete()
    .eq('user_id', userId)
    .eq('property_id', propertyId)
    .select();

  if (error) {
    throw new Error(error.message);
  }
  return data;
};

module.exports = {
  getFavorites,
  addFavorite,
  removeFavorite
};
