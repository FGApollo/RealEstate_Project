const { supabase } = require('../config/supabase');

const getOverview = async (userId) => {
  // 1. Get agent profile from users table
  const { data: agent, error: userError } = await supabase
    .from('users')
    .select('id, name, email, avatar, role, phone, trust_score, verification_status')
    .eq('id', userId)
    .single();

  if (userError) throw new Error(userError.message);

  // 2. Get properties owned by the agent
  const { data: properties, error: propertiesError } = await supabase
    .from('properties')
    .select(`
      id, title, price, thumbnail, views, status, bedrooms, bathrooms, area, city, district, ward, address, property_type, owner_id,
      owner:users!owner_id(name, role, avatar, trust_score, created_at)
    `)
    .eq('owner_id', userId)
    .eq('status', 'AVAILABLE');

  if (propertiesError) throw new Error(propertiesError.message);

  const totalProperties = properties.length;
  const totalViews = properties.reduce((sum, p) => sum + (p.views || 0), 0);

  // 3. Get favorites for these properties
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
    agent,
    totalProperties,
    totalViews,
    totalFavorites,
    activeListings
  };
};

const getAgentReviews = async (agentId) => {
  // 1. Get properties owned by the agent
  const { data: properties, error: propError } = await supabase
    .from('properties')
    .select('id, title')
    .eq('owner_id', agentId);

  if (propError) throw new Error(propError.message);

  if (!properties || properties.length === 0) {
    return [];
  }

  const propertyIds = properties.map(p => p.id);

  // 2. Get reviews for these properties
  const { data: reviews, error: revError } = await supabase
    .from('property_reviews')
    .select(`
      id,
      rating,
      comment,
      created_at,
      status,
      is_verified_review,
      user_id,
      property_id,
      user:users!user_id(name, avatar, role),
      images:property_review_images(image_url)
    `)
    .in('property_id', propertyIds)
    .eq('status', 'APPROVED')
    .order('created_at', { ascending: false });

  if (revError) throw new Error(revError.message);

  // Map property title to reviews
  const propertyTitleMap = {};
  properties.forEach(p => {
    propertyTitleMap[p.id] = p.title;
  });

  return (reviews || []).map(r => ({
    ...r,
    propertyTitle: propertyTitleMap[r.property_id] || ''
  }));
};

module.exports = {
  getOverview,
  getAgentReviews
};

