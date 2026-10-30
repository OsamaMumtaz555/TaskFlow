const express = require('express');
const router = express.Router();

const {
  getNotifications,
  markRead,
  markAllRead,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getNotifications);
router.put('/read-all', protect, markAllRead); // must come before '/:id/read'
router.put('/:id/read', protect, markRead);

module.exports = router;