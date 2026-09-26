const express = require('express');
const { authenticate, authorizeRoles } = require('../middlewares/auth');
const { listNotifications, markAllRead, markOneRead } = require('../controllers/notificationController');

const router = express.Router();

router.use(authenticate, authorizeRoles('CLIENT'));
router.get('/', listNotifications);
router.patch('/read-all', markAllRead);
router.patch('/:id/read', markOneRead);

module.exports = router;
