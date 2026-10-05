const recommendationService = require('../services/recommendationService');

const getRecommendations = async (req, res) => {
  try {
    const { properties, ...pagination } = await recommendationService.getRecommendations(req.user.id, {
      category: req.query.category === 'ALL' ? null : req.query.category,
      limit: req.query.limit,
      offset: req.query.offset,
      feedToken: req.query.feedToken
    });
    return res.status(200).json({ properties, pagination });
  } catch (error) {
    return res.status(error.statusCode || 500).json({
      error: error.statusCode ? error.message : 'Could not load recommendations.',
      ...(error.code ? { code: error.code } : {})
    });
  }
};

module.exports = { getRecommendations };
