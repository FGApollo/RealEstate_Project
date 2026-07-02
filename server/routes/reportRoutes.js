const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');

router.post('/', reportController.createReport);
router.get('/admin', reportController.getAdminReports);
router.post('/admin/:reportId/resolve', reportController.resolveReport);
router.post('/admin/:reportId/reject', reportController.rejectReport);

module.exports = router;
