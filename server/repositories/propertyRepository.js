const { supabase } = require('../config/supabase');

const PROPERTY_SELECT = `
  *,
  property_features(feature_name),
  property_images(image_url),
  lifestyle_tags(tag_name),
  owner:users!owner_id(name, role, avatar, trust_score, created_at, verification_status)
`;

const visibleAndListingTypeFilter = (listingType) => listingType ? [
  `and(is_hidden.is.null,listing_type.eq.${listingType})`,
  `and(is_hidden.eq.false,listing_type.eq.${listingType})`,
  'and(is_hidden.is.null,listing_type.is.null)',
  'and(is_hidden.eq.false,listing_type.is.null)'
].join(',') : 'is_hidden.is.null,is_hidden.eq.false';

const fetchRecommendationCandidates = async (listingType, limit) => {
  let query = supabase.from('properties').select(PROPERTY_SELECT)
    .eq('status', 'AVAILABLE')
    .order('id', { ascending: false })
    .limit(limit);

  query = query.or(visibleAndListingTypeFilter(listingType));
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  return (data || []).filter((property) => {
    const trustScore = Number(property.owner?.trust_score ?? 50);
    return trustScore > 30 && (!listingType || !property.listing_type || property.listing_type === listingType);
  });
};

const fetchPreferenceOptions = async (listingType) => {
  const { data, error } = await supabase.from('properties')
    .select('listing_type, property_type, city, district, property_features(feature_name), lifestyle_tags(tag_name), owner:users!owner_id(trust_score)')
    .eq('status', 'AVAILABLE')
    .or(visibleAndListingTypeFilter(listingType))
    .order('id', { ascending: false })
    .limit(1000);
  if (error) throw new Error(error.message);
  return (data || []).filter((property) => (!listingType
    || !property.listing_type || property.listing_type === listingType)
  && Number(property.owner?.trust_score ?? 50) > 30);
};

const fetchPropertiesByIds = async (ids, listingType) => {
  if (!ids.length) return [];
  const { data, error } = await supabase.from('properties').select(PROPERTY_SELECT)
    .in('id', ids)
    .eq('status', 'AVAILABLE')
    .or('is_hidden.is.null,is_hidden.eq.false');
  if (error) throw new Error(error.message);
  const byId = new Map((data || []).filter((property) => {
    const trustScore = Number(property.owner?.trust_score ?? 50);
    return trustScore > 30 && (!listingType || !property.listing_type || property.listing_type === listingType);
  }).map((property) => [Number(property.id), property]));
  return ids.map((id) => byId.get(Number(id))).filter(Boolean);
};

const fetchRecentEvents = async (userId, since, limit) => {
  const { data, error } = await supabase.from('user_property_events')
    .select('property_id, action, created_at')
    .eq('user_id', userId)
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data || [];
};

const fetchEventProperties = async (propertyIds) => {
  if (!propertyIds.length) return [];
  const { data, error } = await supabase.from('properties')
    .select('id, property_type, city, district, property_features(feature_name), lifestyle_tags(tag_name)')
    .in('id', propertyIds);
  if (error) throw new Error(error.message);
  return data || [];
};

const fetchFavoriteIds = async (userId, candidateIds) => {
  if (!candidateIds.length) return [];
  const { data, error } = await supabase.from('favorites').select('property_id')
    .eq('user_id', userId)
    .in('property_id', candidateIds);
  if (error) throw new Error(error.message);
  return (data || []).map((row) => Number(row.property_id));
};

const recordEvent = async (userId, propertyId, action) => {
  const { data, error } = await supabase.from('user_property_events')
    .insert({ user_id: userId, property_id: propertyId, action })
    .select('id, user_id, property_id, action, created_at')
    .single();
  if (error) throw new Error(error.message);
  return data;
};

module.exports = {
  fetchRecommendationCandidates,
  fetchPreferenceOptions,
  fetchPropertiesByIds,
  fetchRecentEvents,
  fetchEventProperties,
  fetchFavoriteIds,
  recordEvent
};
