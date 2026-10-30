const express = require('express');
const router = express.Router();
const geocodeController = require('../controllers/geocodeController');
const { rateLimiters } = require('../middleware/rateLimiters');

router.get('/search', rateLimiters.read, geocodeController.searchAddress);
router.get('/reverse', rateLimiters.read, geocodeController.reverseGeocode);

module.exports = router;
