const express = require('express');
const router = express.Router();

const {
  getChats,
  getUnreadCount,
  startChat,
  getMessages,
  markConversationRead,
} = require('../controllers/chatController');
const {
  requireConversationMember,
  uploadSingle,
  uploadFile,
  downloadFile,
} = require('../controllers/fileController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getChats);
router.get('/unread-count', protect, getUnreadCount);
router.post('/', protect, startChat);
router.get('/:id/messages', protect, getMessages);
router.put('/:id/read', protect, markConversationRead);

// files: membership is checked BEFORE the upload is accepted
router.post('/:id/files', protect, requireConversationMember, uploadSingle, uploadFile);
router.get('/:id/messages/:messageId/file', protect, downloadFile);

module.exports = router;