const { supabase } = require('../config/supabase');
const propertyRepository = require('../repositories/propertyRepository');
const { boundedInteger } = require('./businessValidation');

const ALLOWED_ACTIONS = new Set(['LIKE', 'DISLIKE', 'VIEW']);

const recordEvent = async (userId, { propertyId, action }) => {
  const id = Number(propertyId);
  if (!Number.isSafeInteger(id) || id < 1) {
    const error = new Error('A valid propertyId is required.');
    error.statusCode = 400;
    throw error;
  }
  if (!ALLOWED_ACTIONS.has(action)) {
    const error = new Error('Unsupported property action.');
    error.statusCode = 400;
    throw error;
  }
  return propertyRepository.recordEvent(userId, id, action);
};

// Lịch sử vuốt lưu trên server (bảng user_property_events): mỗi tin chỉ hiện lượt vuốt gần nhất, mới nhất trước.
// Tin đã bị gỡ / ẩn / không còn công khai vẫn hiện (để người dùng biết) nhưng gắn available = false.
const HISTORY_SCAN_LIMIT = 1000;
const getSwipeHistory = async (userId, { limit, offset } = {}) => {
  const pageSize = boundedInteger(limit, 10, 1, 50);
  const start = boundedInteger(offset, 0, 0, HISTORY_SCAN_LIMIT);
  const { data: events, error } = await supabase.from('user_property_events')
    .select('property_id, action, created_at')
    .eq('user_id', userId)
    .in('action', ['LIKE', 'DISLIKE'])
    .order('created_at', { ascending: false })
    .limit(HISTORY_SCAN_LIMIT);
  if (error) throw new Error(error.message);

  const latest = [];
  const seen = new Set();
  for (const event of events || []) {
    const id = Number(event.property_id);
    if (seen.has(id)) continue;
    seen.add(id);
    latest.push(event);
  }
  const page = latest.slice(start, start + pageSize);
  const ids = page.map((event) => Number(event.property_id));
  let properties = [];
  if (ids.length) {
    const result = await supabase.from('properties')
      .select('id, title, thumbnail, price, listing_type, property_type, ward, district, city, status, is_hidden, is_public')
      .in('id', ids);
    if (result.error) throw new Error(result.error.message);
    properties = result.data || [];
  }
  const byId = new Map(properties.map((property) => [Number(property.id), property]));
  const items = page.map((event) => {
    const property = byId.get(Number(event.property_id));
    const location = property ? [property.ward, property.district, property.city].filter(Boolean).join(', ') : '';
    return {
      id: Number(event.property_id),
      swipeType: event.action === 'LIKE' ? 'right' : 'left',
      swipedAt: event.created_at,
      title: property?.title || 'Tin đăng không còn tồn tại',
      thumbnail: property?.thumbnail || null,
      price: property?.price ?? null,
      listing_type: property?.listing_type || null,
      property_type: property?.property_type || null,
      address: location,
      status: property?.status || 'DELETED',
      available: Boolean(property && !property.is_hidden && property.is_public !== false
        && ['AVAILABLE', 'SOLD', 'RENTED'].includes(property.status))
    };
  });
  return { items, offset: start, nextOffset: start + items.length, hasMore: start + items.length < latest.length, total: latest.length };
};

module.exports = { recordEvent, getSwipeHistory, ALLOWED_ACTIONS };
