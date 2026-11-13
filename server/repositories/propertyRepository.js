const { supabase } = require('../config/supabase');
const { asciiFold } = require('../services/propertySearchFilters');
const { matchesArea } = require('../services/adminAreas');


const SEARCH_POOL_LIMIT = 1000;
const MAX_CANDIDATE_SEARCH = 10000;

// Tìm theo địa điểm dạng chữ (đã chuẩn hóa ở propertySearchFilters): khớp nguyên từ trên phường + quận + thành phố,
// không phân biệt dấu. "quan 1" khớp "Quận 1" nhưng không khớp "Quận 10". Không so địa chỉ đường:
// tin ở Thủ Đức nằm trên "Xa lộ Hà Nội" không được tính là ở Hà Nội.
const matchesLocation = (property, location) => {
  const haystack = asciiFold([property.ward, property.district, property.city]
    .filter(Boolean).join(' '));
  return ` ${haystack} `.includes(` ${location} `);
};

// Lọc địa điểm và phân trang làm ở đây: khi có bộ lọc client-side (location/province/ward/official),
// lấy ứng viên theo từng đợt để không bỏ sót tin phù hợp đứng sau 1.000 ứng viên đầu tiên.
// province / ward: đơn vị hành chính mới chọn từ dropdown, khớp cả tin ghi theo đơn vị cũ (services/adminAreas).
const fetchPublicProperties = async ({ filters = {}, listingType = null, category = null, limit = 24, ids = null, offset = 0 } = {}) => {
  // official: chỉ tin của tài khoản chính thức Swipe Nest (nguồn hàng của Plus), lọc ở đây vì RPC không có bộ lọc này.
  const { location, province, ward, official, ...rpcFilters } = filters;
  const filterHere = Boolean(location || province || ward || official);

  const isMatch = (property) => (!official || property.owner?.is_official === true)
    && (!location || matchesLocation(property, location))
    && (!(province || ward) || matchesArea(property, { province, ward }));

  if (!filterHere) {
    const rpcLimit = Math.min(SEARCH_POOL_LIMIT, offset + limit);
    const { data, error } = await supabase.rpc('search_ranked_properties', {
      p_filters: rpcFilters, p_listing_type: listingType, p_category: category === 'ALL' ? null : category,
      p_limit: rpcLimit, p_ids: ids
    });
    if (error) throw new Error('Không thể tải danh sách bất động sản.');
    return (data || []).slice(offset, offset + limit);
  }

  let matchingRows = [];
  let currentOffset = 0;

  while (currentOffset < MAX_CANDIDATE_SEARCH) {
    const rpcArgs = {
      p_filters: rpcFilters,
      p_listing_type: listingType,
      p_category: category === 'ALL' ? null : category,
      p_limit: SEARCH_POOL_LIMIT,
      p_ids: ids
    };
    if (currentOffset > 0) {
      rpcArgs.p_offset = currentOffset;
    }

    let { data, error } = await supabase.rpc('search_ranked_properties', rpcArgs);
    if (error && currentOffset > 0 && ['PGRST202', '42883', '42725'].includes(error.code)) {
      break;
    }
    if (error) throw new Error('Không thể tải danh sách bất động sản.');

    const batch = data || [];
    for (const property of batch) {
      if (isMatch(property)) {
        matchingRows.push(property);
      }
    }

    if (matchingRows.length >= offset + limit || batch.length < SEARCH_POOL_LIMIT) {
      break;
    }

    currentOffset += SEARCH_POOL_LIMIT;
  }

  return matchingRows.slice(offset, offset + limit);
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

// Số lượt thích của mỗi tin (dùng xếp hạng phần "Phổ biến" của feed).
const fetchFavoriteCounts = async (propertyIds) => {
  const counts = new Map();
  if (!propertyIds.length) return counts;
  const { data, error } = await supabase.from('favorites').select('property_id').in('property_id', propertyIds);
  if (error) throw new Error(error.message);
  (data || []).forEach((row) => counts.set(Number(row.property_id), (counts.get(Number(row.property_id)) || 0) + 1));
  return counts;
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
  fetchFavoriteCounts,
  recordEvent
};
