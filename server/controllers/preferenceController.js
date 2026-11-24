const preferenceService = require('../services/preferenceService');
const propertyEventService = require('../services/propertyEventService');
const { appCache } = require('../services/ttlCache');

const PREFERENCE_OPTIONS_TTL_MS = 60 * 1000;

const sendError = (res, error, fallback) => res.status(error.statusCode || 500).json({
  error: error.statusCode ? error.message : fallback,
  ...(error.code ? { code: error.code } : {})
});

const getPreferences = async (req, res) => {
  try {
    const preferences = await preferenceService.getPreferences(req.user.id);
    return res.status(200).json({ preferences });
  } catch (error) {
    return sendError(res, error, 'Could not load preferences.');
  }
};

const savePreferences = async (req, res) => {
  try {
    const body = req.body || {};
    const allowed = new Set([
      'listing_type', 'preferred_property_types', 'preferred_location_keys', 'min_price', 'max_price',
      'min_bedrooms', 'max_bedrooms', 'min_area', 'max_area', 'preferred_features'
    ]);
    if (typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !allowed.has(key))) {
      return res.status(400).json({ error: 'Unsupported preference field.' });
    }
    const preferences = await preferenceService.savePreferences(req.user.id, body);
    return res.status(200).json({ preferences });
  } catch (error) {
    return sendError(res, error, 'Could not save preferences.');
  }
};

const CACHEABLE_LISTING_TYPES = new Set(['', 'RENT', 'SALE']);

const getOptions = async (req, res) => {
  try {
    const rawListingType = typeof req.query.listingType === 'string'
      ? req.query.listingType.trim().toUpperCase()
      : '';
    const load = () => preferenceService.getPreferenceOptions(rawListingType || undefined);
    const options = CACHEABLE_LISTING_TYPES.has(rawListingType)
      ? await appCache.getOrSet(
        `preferences:options:${rawListingType || 'ALL'}`,
        PREFERENCE_OPTIONS_TTL_MS,
        load
      )
      : await load();
    if (typeof res.set === 'function') {
      res.set('Cache-Control', 'private, max-age=60');
    }
    return res.status(200).json({ options });
  } catch (error) {
    return sendError(res, error, 'Could not load available preference options.');
  }
};

const recordEvent = async (req, res) => {
  try {
    const body = req.body || {};
    if (typeof body !== 'object' || Array.isArray(body)
      || Object.keys(body).some((key) => !['propertyId', 'action'].includes(key))) {
      return res.status(400).json({ error: 'Unsupported property event field.' });
    }
    const event = await propertyEventService.recordEvent(req.user.id, body);
    return res.status(201).json({ event });
  } catch (error) {
    return sendError(res, error, 'Could not record property event.');
  }
};

const getSwipeHistory = async (req, res) => {
  try {
    res.set('Cache-Control', 'no-store');
    return res.status(200).json(await propertyEventService.getSwipeHistory(req.user.id, req.query));
  } catch (error) {
    return sendError(res, error, 'Could not load swipe history.');
  }
};

module.exports = { getPreferences, savePreferences, getOptions, recordEvent, getSwipeHistory };
