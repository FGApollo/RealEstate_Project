const express = require('express');
const router = express.Router();
const preferenceController = require('../controllers/preferenceController');
const { authenticate } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate);
router.get('/preferences', rateLimiters.read, preferenceController.getPreferences);
router.put('/preferences', rateLimiters.write, preferenceController.savePreferences);
router.get('/preference-options', rateLimiters.read, preferenceController.getOptions);
router.post('/property-events', rateLimiters.write, preferenceController.recordEvent);

module.exports = router;
