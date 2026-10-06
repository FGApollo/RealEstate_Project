const preferenceService = require('./preferenceService');
const propertyRepository = require('../repositories/propertyRepository');
const { propertyTypeKey, locationKey, propertyFeatureKeys } = require('./recommendationKeys');
const jwt = require('jsonwebtoken');

const SCORING = Object.freeze({
  weights: Object.freeze({ propertyType: 20, location: 25, budget: 25, bedrooms: 12, area: 8, features: 10 }),
  actionStrength: Object.freeze({ LIKE: 1.5, DISLIKE: -2, VIEW: 0.25, FAVORITE: 2.5, UNFAVORITE: -1.5 }),
  behaviorScale: Object.freeze({ propertyType: 2, location: 3, feature: 1.5 }),
  maxBehaviorPoints: 15,
  legacyListingPenalty: 15,
  candidateLimit: 500,
  eventDays: 90,
  dislikeCooldownDays: 30,
  defaultPageSize: 24,
  maxPageSize: 50
});
const FEED_TOKEN_AUDIENCE = 'swipe-recommendation-feed';
const DEFAULT_PREFERENCES = Object.freeze({
  listing_type: 'RENT',
  preferred_property_types: [],
  preferred_location_keys: [],
  min_price: null,
  max_price: null,
  min_bedrooms: null,
  max_bedrooms: null,
  min_area: null,
  max_area: null,
  preferred_features: [],
  onboarding_completed: false,
  updated_at: null
});
const getFeedTokenSecret = () => {
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, 'utf8') < 32) {
    throw new Error('JWT_SECRET must contain at least 32 bytes of random data');
  }
  return process.env.JWT_SECRET;
};

const categoryKey = (value) => {
  return propertyTypeKey(value);
};

const scoreProperty = (property, preference, behaviorProfile) => {
  const weights = SCORING.weights;
  let score = 0;
  const reasons = [];
  const typeKey = propertyTypeKey(property.property_type);
  const preferredTypes = preference.preferred_property_types || [];
  if (preferredTypes.includes(typeKey)) {
    score += weights.propertyType;
    reasons.push('property type match');
  }

  const preferredLocations = preference.preferred_location_keys || [];
  const propertyLocation = locationKey(property);
  if (propertyLocation && preferredLocations.includes(propertyLocation)) {
    score += weights.location;
    reasons.push('location match');
  }

  const price = Number(property.price);
  const minPrice = preference.min_price === null ? null : Number(preference.min_price);
  const maxPrice = preference.max_price === null ? null : Number(preference.max_price);
  if (Number.isFinite(price) && price > 0 && (minPrice !== null || maxPrice !== null)) {
    if ((minPrice === null || price >= minPrice) && (maxPrice === null || price <= maxPrice)) {
      score += weights.budget;
      reasons.push('budget match');
    } else {
      const bound = price < minPrice ? minPrice : maxPrice;
      const distance = Math.abs(price - bound) / Math.max(bound, 1);
      const partial = weights.budget * Math.max(0, 1 - distance * 2);
      score += partial;
      if (partial > 0) reasons.push('near budget');
    }
  }

  const bedrooms = Number(property.bedrooms);
  const minBedrooms = preference.min_bedrooms === null ? null : Number(preference.min_bedrooms);
  const maxBedrooms = preference.max_bedrooms === null ? null : Number(preference.max_bedrooms);
  if (Number.isFinite(bedrooms) && bedrooms > 0 && (minBedrooms !== null || maxBedrooms !== null)
    && (minBedrooms === null || bedrooms >= minBedrooms) && (maxBedrooms === null || bedrooms <= maxBedrooms)) {
    score += weights.bedrooms;
    reasons.push('bedroom match');
  }

  const area = Number(property.area);
  const minArea = preference.min_area === null ? null : Number(preference.min_area);
  const maxArea = preference.max_area === null ? null : Number(preference.max_area);
  if (Number.isFinite(area) && area > 0 && (minArea !== null || maxArea !== null)
    && (minArea === null || area >= minArea) && (maxArea === null || area <= maxArea)) {
    score += weights.area;
    reasons.push('area match');
  }

  const preferredFeatures = preference.preferred_features || [];
  const matchedFeatureCount = propertyFeatureKeys(property).filter((key) => preferredFeatures.includes(key)).length;
  if (preferredFeatures.length && matchedFeatureCount) {
    score += weights.features * matchedFeatureCount / preferredFeatures.length;
    reasons.push('amenity match');
  }

  const typeSignal = behaviorProfile.propertyTypes.get(typeKey) || 0;
  const locationSignal = behaviorProfile.locations.get(propertyLocation) || 0;
  const featureSignal = propertyFeatureKeys(property)
    .reduce((total, key) => total + (behaviorProfile.features.get(key) || 0), 0);
  const behaviorDelta = Math.max(-SCORING.maxBehaviorPoints, Math.min(SCORING.maxBehaviorPoints,
    typeSignal * SCORING.behaviorScale.propertyType
      + locationSignal * SCORING.behaviorScale.location
      + featureSignal * SCORING.behaviorScale.feature));
  if (behaviorDelta > 0.25) reasons.push('similar to recent positive signals');
  if (behaviorDelta < -0.25) reasons.push('similar to recent negative signals');

  if (!property.listing_type) {
    score -= SCORING.legacyListingPenalty;
    reasons.push('legacy listing type not classified');
  }
  return { score: Math.round(score + behaviorDelta), baseScore: Math.round(score), behaviorDelta, reasons };
};

const buildBehaviorProfile = async (userId) => {
  const since = new Date(Date.now() - SCORING.eventDays * 24 * 60 * 60 * 1000).toISOString();
  const events = await propertyRepository.fetchRecentEvents(userId, since, 250);
  const ids = [...new Set(events.map((event) => Number(event.property_id)).filter(Number.isSafeInteger))];
  const properties = await propertyRepository.fetchEventProperties(ids);
  const propertyById = new Map(properties.map((property) => [Number(property.id), property]));
  const profile = { propertyTypes: new Map(), locations: new Map(), features: new Map() };
  const now = Date.now();
  const latestFeedback = new Map();
  const latestViews = new Map();

  events.forEach((event) => {
    const propertyId = Number(event.property_id);
    const target = event.action === 'VIEW' ? latestViews : latestFeedback;
    if (!target.has(propertyId)) target.set(propertyId, event);
  });
  latestViews.forEach((event, propertyId) => {
    if (!latestFeedback.has(propertyId)) latestFeedback.set(propertyId, event);
  });

  latestFeedback.forEach((event) => {
    const property = propertyById.get(Number(event.property_id));
    const strength = SCORING.actionStrength[event.action];
    if (!property || !strength) return;
    const ageDays = Math.max(0, (now - new Date(event.created_at).getTime()) / (24 * 60 * 60 * 1000));
    const decayed = strength * Math.max(0.15, 1 - ageDays / SCORING.eventDays);
    const type = propertyTypeKey(property.property_type);
    const location = locationKey(property);
    profile.propertyTypes.set(type, Math.max(-5, Math.min(5, (profile.propertyTypes.get(type) || 0) + decayed)));
    if (location) profile.locations.set(location,
      Math.max(-5, Math.min(5, (profile.locations.get(location) || 0) + decayed)));
    propertyFeatureKeys(property).forEach((key) => profile.features.set(key,
      Math.max(-5, Math.min(5, (profile.features.get(key) || 0) + decayed))));
  });
  return { events, propertyById, profile, now };
};

const getRecommendations = async (userId, { category, limit, offset, feedToken } = {}) => {
  const savedPreferences = await preferenceService.getPreferences(userId);
  const preference = savedPreferences?.onboarding_completed ? savedPreferences : DEFAULT_PREFERENCES;

  const requestedLimit = Number(limit);
  const requestedOffset = Number(offset);
  const pageSize = Number.isFinite(requestedLimit) && requestedLimit > 0
    ? Math.min(SCORING.maxPageSize, Math.floor(requestedLimit)) : SCORING.defaultPageSize;
  const pageOffset = Number.isFinite(requestedOffset) && requestedOffset > 0
    ? Math.min(SCORING.candidateLimit, Math.floor(requestedOffset)) : 0;

  if (feedToken) {
    let snapshot;
    try {
      snapshot = jwt.verify(feedToken, getFeedTokenSecret(), {
        algorithms: ['HS256'],
        audience: FEED_TOKEN_AUDIENCE
      });
    } catch {
      const error = new Error('Recommendation feed expired. Refresh the feed to continue.');
      error.statusCode = 400;
      error.code = 'RECOMMENDATION_FEED_EXPIRED';
      throw error;
    }
    const expectedCategory = category ? categoryKey(category) : 'ALL';
    if (snapshot.sub !== String(userId) || snapshot.category !== expectedCategory
      || snapshot.preferenceUpdatedAt !== preference.updated_at || !Array.isArray(snapshot.ids)) {
      const error = new Error('Recommendation feed token does not match this account or category.');
      error.statusCode = 400;
      error.code = 'INVALID_RECOMMENDATION_FEED';
      throw error;
    }
    const ids = snapshot.ids.slice(pageOffset, pageOffset + pageSize);
    const properties = (await propertyRepository.fetchPropertiesByIds(ids, preference.listing_type))
      .filter((property) => !preference.listing_type || !property.listing_type || property.listing_type === preference.listing_type);
    const nextOffset = pageOffset + ids.length;
    return {
      properties,
      offset: pageOffset,
      nextOffset,
      hasMore: nextOffset < snapshot.ids.length,
      feedToken
    };
  }

  const candidates = await propertyRepository.fetchRecommendationCandidates(preference.listing_type, SCORING.candidateLimit);
  const [favoriteIds, behavior] = await Promise.all([
    propertyRepository.fetchFavoriteIds(userId, candidates.map((property) => property.id)),
    buildBehaviorProfile(userId)
  ]);

  const latestFeedbackByProperty = new Map();
  behavior.events.forEach((event) => {
    const propertyId = Number(event.property_id);
    if (event.action !== 'VIEW' && !latestFeedbackByProperty.has(propertyId)) {
      latestFeedbackByProperty.set(propertyId, event);
    }
  });
  const favoriteSet = new Set(favoriteIds);
  const cooldownMs = SCORING.dislikeCooldownDays * 24 * 60 * 60 * 1000;
  const scored = candidates
    .filter((property) => {
      if (property.listing_type && property.listing_type !== preference.listing_type) return false;
      if (category && category !== 'ALL' && categoryKey(property.property_type) !== categoryKey(category)) return false;
      if (favoriteSet.has(Number(property.id))) return false;
      const latest = latestFeedbackByProperty.get(Number(property.id));
      return !(latest?.action === 'DISLIKE' && behavior.now - new Date(latest.created_at).getTime() < cooldownMs);
    })
    .map((property) => ({ property, match: scoreProperty(property, preference, behavior.profile) }))
    .sort((a, b) => b.match.score - a.match.score || Number(b.property.id) - Number(a.property.id));

  const categorySnapshotKey = category ? categoryKey(category) : 'ALL';
  const signedFeedToken = jwt.sign({
    category: categorySnapshotKey,
    preferenceUpdatedAt: preference.updated_at,
    ids: scored.map(({ property }) => Number(property.id))
  },
    getFeedTokenSecret(), {
      algorithm: 'HS256',
      subject: String(userId),
      audience: FEED_TOKEN_AUDIENCE,
      expiresIn: '2h'
    });
  const scoredPage = scored.slice(pageOffset, pageOffset + pageSize);
  const page = scoredPage.map(({ property, match }) => ({
    ...property,
    ...(process.env.NODE_ENV === 'production' ? {} : {
      recommendation_debug: { score: match.score, baseScore: match.baseScore, behaviorDelta: match.behaviorDelta, reasons: match.reasons }
    })
  }));
  const nextOffset = pageOffset + scoredPage.length;
  return { properties: page, offset: pageOffset, nextOffset, hasMore: nextOffset < scored.length, feedToken: signedFeedToken };
};

module.exports = { getRecommendations, scoreProperty, buildBehaviorProfile, SCORING, DEFAULT_PREFERENCES };
