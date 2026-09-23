const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/propertyController');
const { authenticate, requireRole } = require('../middleware/authenticate');

router.get('/', propertyController.getProperties);
router.post('/check-before-save', authenticate, requireRole('AGENT'), propertyController.checkBeforeSave);
router.post('/', authenticate, requireRole('AGENT'), propertyController.createProperty);
router.get('/:id/similar', propertyController.getSimilarProperties);
router.get('/:id', propertyController.getPropertyById);
router.put('/:id', authenticate, requireRole('AGENT'), propertyController.updateProperty);
router.delete('/:id', authenticate, requireRole('AGENT'), propertyController.deleteProperty);
router.get('/:id/reviews', propertyController.getPropertyReviews);
router.post('/:id/reviews', authenticate, propertyController.createPropertyReview);

module.exports = router;
