const router = require('express').Router();
const controller = require('../controllers/paymentController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.post('/payos/webhook', controller.webhook);
router.use(authenticate, requireRole('AGENT'));
router.get('/catalog', rateLimiters.read, controller.catalog);
router.get('/', rateLimiters.read, controller.list);
router.post('/', rateLimiters.expensive, controller.create);
router.get('/:id', rateLimiters.read, controller.get);
router.post('/:id/cancel', rateLimiters.write, controller.cancel);
module.exports = router;
