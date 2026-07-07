const express = require('express');
const router = express.Router();
const propertyController = require('../controllers/propertyController');

router.get('/', propertyController.getProperties);
router.post('/check-before-save', propertyController.checkBeforeSave);
router.post('/', propertyController.createProperty);
router.get('/:id/similar', propertyController.getSimilarProperties);
router.get('/:id', propertyController.getPropertyById);
router.put('/:id', propertyController.updateProperty);
router.delete('/:id', propertyController.deleteProperty);
router.get('/:id/reviews', propertyController.getPropertyReviews);
router.post('/:id/reviews', propertyController.createPropertyReview);

module.exports = router;
