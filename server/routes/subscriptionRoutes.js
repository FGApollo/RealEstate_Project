const express = require('express');
const router = express.Router();
const subscriptionController = require('../controllers/subscriptionController');
const { authenticate, requireRole } = require('../middleware/authenticate');
const { rateLimiters } = require('../middleware/rateLimiters');

router.use(authenticate, requireRole('AGENT'));

router.get('/', rateLimiters.read, subscriptionController.getSubscription);
router.post('/', rateLimiters.write, subscriptionController.createOrUpdateSubscription);
// Dùng thử Lite 1 tháng miễn phí (mỗi tài khoản một lần).
router.get('/trial', rateLimiters.read, subscriptionController.getTrialStatus);
router.post('/trial', rateLimiters.write, subscriptionController.createOrUpdateSubscription);
// Hủy các kỳ đã mua nhưng chưa bắt đầu (kỳ đang chạy giữ nguyên).
router.post('/cancel', rateLimiters.write, subscriptionController.cancelQueuedPeriods);

module.exports = router;
