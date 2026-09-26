const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/propertyController');
const { authenticate, requireRole, optionalAuthenticate } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.get('/', rateLimiters.read, propertyController.getProperties);
router.post('/check-before-save', authenticate, requireRole('AGENT'), rateLimiters.expensive,
  propertyController.checkBeforeSave);
router.post('/', authenticate, requireRole('AGENT'), rateLimiters.write, propertyController.createProperty);
router.get('/:id/similar', rateLimiters.expensive, propertyController.getSimilarProperties);
router.get('/:id', rateLimiters.read, propertyController.getPropertyById);
router.put('/:id', authenticate, requireRole('AGENT'), rateLimiters.write, propertyController.updateProperty);
router.delete('/:id', authenticate, requireRole('AGENT'), rateLimiters.write, propertyController.deleteProperty);
router.get('/:id/reviews', rateLimiters.read, optionalAuthenticate, propertyController.getPropertyReviews);
router.post('/:id/reviews', authenticate, rateLimiters.write, propertyController.createPropertyReview);
router.post('/reviews/:reviewId/reply', authenticate, rateLimiters.write, propertyController.createReviewReply);
router.post('/reviews/:reviewId/helpful', authenticate, rateLimiters.write, propertyController.toggleReviewHelpful);

module.exports = router;
