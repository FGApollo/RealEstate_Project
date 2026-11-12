const router = require('express').Router();
const controller = require('../controllers/plusController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

// Gói Swipe Nest Plus của người dùng. Webhook payOS dùng chung /api/payments/payos/webhook.
router.use(authenticate, requireRole('USER'));
router.get('/status', rateLimiters.read, controller.status);
router.get('/catalog', rateLimiters.read, controller.catalog);
router.get('/official-listings', rateLimiters.read, controller.officialListings);
router.get('/payments', rateLimiters.read, controller.listPayments);
router.post('/payments', rateLimiters.expensive, controller.createPayment);
router.get('/payments/:id', rateLimiters.read, controller.getPayment);
router.post('/payments/:id/cancel', rateLimiters.write, controller.cancelPayment);

module.exports = router;
