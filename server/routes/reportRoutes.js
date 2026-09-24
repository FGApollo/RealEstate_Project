const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticate, requireRole } = require('../middleware/authenticate');

// 2.1. User gửi report bài đăng
// POST /api/reports
router.post('/', authenticate, reportController.createReport);

// 2.2. Admin xem danh sách report
// GET /api/reports/admin?status=PENDING
router.get('/admin', authenticate, requireRole('ADMIN'), reportController.getAdminReports);

// 2.3. Admin xác nhận report đúng
// POST /api/reports/admin/:reportId/resolve
router.post('/admin/:reportId/resolve', authenticate, requireRole('ADMIN'), reportController.resolveReport);

// 2.4. Admin từ chối report sai
// POST /api/reports/admin/:reportId/reject
router.post('/admin/:reportId/reject', authenticate, requireRole('ADMIN'), reportController.rejectReport);

module.exports = router;
