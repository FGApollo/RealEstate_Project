const preferenceRepository = require('../repositories/preferenceRepository');
const propertyRepository = require('../repositories/propertyRepository');
const {
  PROPERTY_TYPES,
  normalizeKey,
  propertyTypeKey,
  locationKey
} = require('./recommendationKeys');

const fail = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const optionalNumber = (value, field, maximum) => {
  if (value === undefined || value === null || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > maximum) {
    throw fail(`${field} is invalid`);
  }
  return number;
};

const normalizeArray = (value, field, limit) => {
  if (!Array.isArray(value)) throw fail(`${field} must be an array`);
  if (value.length > limit) throw fail(`${field} has too many values`);
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
};

const getPreferences = async (userId) => preferenceRepository.getByUserId(userId);

const savePreferences = async (userId, body) => {
  if (!body || !['RENT', 'SALE'].includes(body.listing_type)) {
    throw fail('Choose whether you are looking to rent or buy.');
  }

  const propertyTypes = normalizeArray(body.preferred_property_types, 'preferred_property_types', 8);
  const allowedTypes = new Set(PROPERTY_TYPES.map((type) => type.key));
  if (propertyTypes.some((key) => !allowedTypes.has(key))) {
    throw fail('A preferred property type is not supported.');
  }

  const locations = normalizeArray(body.preferred_location_keys, 'preferred_location_keys', 20);
  const features = normalizeArray(body.preferred_features, 'preferred_features', 40)
    .map(normalizeKey).filter(Boolean);
  if (locations.some((key) => !/^[a-z0-9_]+\|[a-z0-9_]+$/.test(key))) {
    throw fail('A preferred location is invalid.');
  }

  const minPrice = optionalNumber(body.min_price, 'min_price', 1000000000000);
  const maxPrice = optionalNumber(body.max_price, 'max_price', 1000000000000);
  const minBedrooms = optionalNumber(body.min_bedrooms, 'min_bedrooms', 20);
  const maxBedrooms = optionalNumber(body.max_bedrooms, 'max_bedrooms', 20);
  const minArea = optionalNumber(body.min_area, 'min_area', 10000);
  const maxArea = optionalNumber(body.max_area, 'max_area', 10000);
  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) throw fail('Minimum price exceeds maximum price.');
  if (minBedrooms !== null && maxBedrooms !== null && minBedrooms > maxBedrooms) throw fail('Minimum bedrooms exceeds maximum bedrooms.');
  if (minArea !== null && maxArea !== null && minArea > maxArea) throw fail('Minimum area exceeds maximum area.');

  return preferenceRepository.upsertForUser(userId, {
    listing_type: body.listing_type,
    preferred_property_types: propertyTypes,
    preferred_location_keys: locations,
    min_price: minPrice,
    max_price: maxPrice,
    min_bedrooms: minBedrooms,
    max_bedrooms: maxBedrooms,
    min_area: minArea,
    max_area: maxArea,
    preferred_features: features
  });
};

const getPreferenceOptions = async (listingType) => {
  if (listingType && !['RENT', 'SALE'].includes(listingType)) throw fail('listingType is invalid.');
  const properties = await propertyRepository.fetchPreferenceOptions(listingType);
  const typeCounts = new Map();
  const locationCounts = new Map();
  const featureCounts = new Map();
  const locationLabels = new Map();
  const featureLabels = new Map();

  properties.forEach((property) => {
    const type = propertyTypeKey(property.property_type);
    if (PROPERTY_TYPES.some((item) => item.key === type)) typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    const key = locationKey(property);
    if (key) {
      locationCounts.set(key, (locationCounts.get(key) || 0) + 1);
      locationLabels.set(key, `${property.district}, ${property.city}`);
    }
    [
      ...(property.property_features || []).map((row) => row.feature_name),
      ...(property.lifestyle_tags || []).map((row) => row.tag_name)
    ].forEach((label) => {
      const featureKey = normalizeKey(label);
      if (!featureKey) return;
      featureCounts.set(featureKey, (featureCounts.get(featureKey) || 0) + 1);
      featureLabels.set(featureKey, String(label).trim());
    });
  });

  return {
    property_types: PROPERTY_TYPES.filter((type) => typeCounts.has(type.key)),
    locations: [...locationCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => ({ key, label: locationLabels.get(key) })),
    features: [...featureCounts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([key]) => ({ key, label: featureLabels.get(key) }))
  };
};

module.exports = { getPreferences, savePreferences, getPreferenceOptions };
