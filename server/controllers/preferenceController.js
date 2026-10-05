const preferenceService = require('../services/preferenceService');
const propertyEventService = require('../services/propertyEventService');

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

const getOptions = async (req, res) => {
  try {
    const options = await preferenceService.getPreferenceOptions(req.query.listingType?.toUpperCase());
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

module.exports = { getPreferences, savePreferences, getOptions, recordEvent };
