const express = require('express');
const router = express.Router();

const {
  getChats,
  startChat,
  getMessages,
  markConversationRead,
} = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getChats);
router.post('/', protect, startChat);
router.get('/:id/messages', protect, getMessages);
router.put('/:id/read', protect, markConversationRead);

module.exports = router;