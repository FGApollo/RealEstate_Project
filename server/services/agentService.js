const { supabase } = require('../config/supabase');

const getOverview = async (userId) => {
  // 1. Get properties owned by the agent
  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select('id, title, price, thumbnail, views, status')
    .eq('owner_id', userId)
    .eq('status', 'AVAILABLE');

  if (propertiesError) throw new Error(propertiesError.message);

  const totalProperties = properties.length;
  const totalViews = properties.reduce((sum, p) => sum + (p.views || 0), 0);

  // 2. Get favorites for these properties
  const propertyIds = properties.map(p => p.id);
  
  let totalFavorites = 0;
  let activeListings = properties.map(p => ({ ...p, favoritesCount: 0 }));

  if (propertyIds.length > 0) {
    const { data: favorites, error: favoritesError } = await supabase
      .from('favorites')
      .select('property_id')
      .in('property_id', propertyIds);

    if (favoritesError) throw new Error(favoritesError.message);

    totalFavorites = favorites.length;

    // Count favorites per property
    const favoritesCountMap = {};
    favorites.forEach(f => {
      favoritesCountMap[f.property_id] = (favoritesCountMap[f.property_id] || 0) + 1;
    });

    activeListings = activeListings.map(p => ({
      ...p,
      favoritesCount: favoritesCountMap[p.id] || 0
    }));
  }

  return {
    totalProperties,
    totalViews,
    totalFavorites,
    activeListings
  };
};

module.exports = {
  getOverview
};
