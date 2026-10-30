const { supabase } = require('../config/supabase');


const fetchPublicProperties = async ({ filters = {}, listingType = null, category = null, limit = 24, ids = null } = {}) => {
  const { data, error } = await supabase.rpc('search_ranked_properties', {
    p_filters: filters, p_listing_type: listingType, p_category: category === 'ALL' ? null : category,
    p_limit: limit, p_ids: ids
  });
  if (error) throw new Error('Không thể tải danh sách bất động sản.');
  return data || [];
};
const fetchRecommendationCandidates = (listingType, limit, filters = {}, category) => fetchPublicProperties({ listingType, limit, filters, category });
const fetchPreferenceOptions = listingType => fetchPublicProperties({ listingType, limit: 1000 });
const fetchPropertiesByIds = (ids, listingType) => ids.length ? fetchPublicProperties({ ids, listingType, limit: ids.length }) : Promise.resolve([]);

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
  fetchPublicProperties,
  fetchRecommendationCandidates,
  fetchPreferenceOptions,
  fetchPropertiesByIds,
  fetchRecentEvents,
  fetchEventProperties,
  fetchFavoriteIds,
  recordEvent
};
