const axios = require('axios');

const cache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const NOMINATIM_USER_AGENT = 'SwipeNest/1.0 (https://swipenest.com; contact@swipenest.com)';

const getCached = (key) => {
  const item = cache.get(key);
  if (!item) return null;
  if (Date.now() > item.expiresAt) {
    cache.delete(key);
    return null;
  }
  return item.data;
};

const setCached = (key, data) => {
  if (cache.size > 1000) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
};

/**
 * Proxy Nominatim geocode search to prevent browser cross-origin (CORS) blocks
 * and comply with OpenStreetMap User-Agent policy.
 */
const searchAddress = async (req, res) => {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!query) {
      return res.status(200).json([]);
    }

    const limit = Math.min(5, Math.max(1, parseInt(req.query.limit, 10) || 1));
    const cacheKey = `search:${query.toLowerCase()}:${limit}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/search', {
      params: {
        format: 'json',
        q: query,
        limit,
        'accept-language': 'vi'
      },
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT
      },
      timeout: 6000
    });

    const data = Array.isArray(response.data) ? response.data : [];
    setCached(cacheKey, data);
    return res.status(200).json(data);
  } catch (err) {
    console.warn('Geocoding search proxy warning:', err.message);
    return res.status(200).json([]);
  }
};

/**
 * Proxy Nominatim reverse geocode (lat, lon -> address) to prevent browser CORS blocks.
 */
const reverseGeocode = async (req, res) => {
  try {
    const lat = parseFloat(req.query.lat);
    const lon = parseFloat(req.query.lon ?? req.query.lng);

    if (isNaN(lat) || isNaN(lon)) {
      return res.status(400).json({ error: 'Valid lat and lon are required' });
    }

    const roundedLat = lat.toFixed(4);
    const roundedLon = lon.toFixed(4);
    const cacheKey = `reverse:${roundedLat}:${roundedLon}`;
    const cached = getCached(cacheKey);
    if (cached) {
      return res.status(200).json(cached);
    }

    const response = await axios.get('https://nominatim.openstreetmap.org/reverse', {
      params: {
        format: 'json',
        lat,
        lon,
        'accept-language': 'vi'
      },
      headers: {
        'User-Agent': NOMINATIM_USER_AGENT
      },
      timeout: 6000
    });

    const data = response.data || {};
    setCached(cacheKey, data);
    return res.status(200).json(data);
  } catch (err) {
    console.warn('Reverse geocoding proxy warning:', err.message);
    return res.status(200).json({ display_name: '', address: {} });
  }
};

module.exports = {
  searchAddress,
  reverseGeocode
};
