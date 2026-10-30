const recommendationService = require('../services/recommendationService');
const { toPublicProperty } = require('../services/publicPropertyDto');
const { parseSearchFilters } = require('../services/propertySearchFilters');

const getRecommendations = async (req, res) => {
  try {
    const { properties, ...pagination } = await recommendationService.getRecommendations(req.user.id, {
      category: req.query.category === 'ALL' ? null : req.query.category,
      limit: req.query.limit,
      offset: req.query.offset,
      feedToken: req.query.feedToken,
      filters: parseSearchFilters(req.query.filters)
    });
    return res.status(200).json({ properties: properties.map(toPublicProperty), pagination });
  } catch (error) {
    console.error('getRecommendations error:', error);
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Could not load recommendations.',
      ...(error.code ? { code: error.code } : {}),
      details: process.env.NODE_ENV === 'production' ? undefined : error.message
    });
  }
};

module.exports = { getRecommendations };
