const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const { saveMessage, getConversationForUser } = require('../services/chatService');
const {
  MAX_FILE_SIZE,
  ALLOWED_TYPES,
  INLINE_TYPES,
  upload,
  matchesSignature,
  absolutePath,
  removeFile,
  cleanName,
} = require('../services/fileStorage');

// Runs BEFORE multer: only the two people in the conversation may upload into it.
// (Otherwise multer would already have written the file to disk.)
const requireConversationMember = async (req, res, next) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user._id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    req.conversation = conversation;
    next();
  } catch (error) {
    res.status(500).json({ message: 'Error checking conversation', error: error.message });
  }
};

// multer with friendly error messages
const uploadSingle = (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({
        message: `The file is too large (maximum ${MAX_FILE_SIZE / 1024 / 1024} MB)`,
      });
    }
    return res.status(400).json({ message: err.message || 'Upload failed' });
  });
};

// POST /api/chats/:id/files  (multipart: "file" + optional "text" note)
const uploadFile = async (req, res) => {
  const file = req.file;
  if (!file) {
    return res.status(400).json({ message: 'No file was uploaded' });
  }

  try {
    const ext = path.extname(file.filename).toLowerCase();

    // is it really what its extension says?
    if (!(await matchesSignature(file.path, ext))) {
      await removeFile(file.path);
      return res
        .status(400)
        .json({ message: 'The file content does not match its file type' });
    }

    // browsers send names in a different encoding: fix letters like é, ü or Urdu
    const originalName = cleanName(
      Buffer.from(file.originalname, 'latin1').toString('utf8')
    );

    const { message, conversation } = await saveMessage({
      conversationId: req.conversation._id,
      senderId: req.user._id,
      text: typeof req.body.text === 'string' ? req.body.text : '',
      attachment: {
        originalName,
        storedName: file.filename,
        mimeType: ALLOWED_TYPES[ext], // the trusted type, not the one the browser sent
        size: file.size,
      },
    });

    // push to both people, live, like any other message
    const io = req.app.get('io');
    conversation.participants.forEach((participantId) => {
      io?.to(`user:${participantId}`).emit('message:new', message);
    });

    res.status(201).json(message);
  } catch (error) {
    await removeFile(file.path); // no message was created, so don't keep the file
    res.status(400).json({ message: error.message });
  }
};

// GET /api/chats/:id/messages/:messageId/file[?download=1]
const downloadFile = async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user._id);
    if (!conversation || !mongoose.Types.ObjectId.isValid(req.params.messageId)) {
      return res.status(404).json({ message: 'File not found' });
    }

    const message = await Message.findOne({
      _id: req.params.messageId,
      conversation: conversation._id,
    }).select('+attachment.storedName');

    if (!message || !message.attachment || !message.attachment.storedName) {
      return res.status(404).json({ message: 'File not found' });
    }

    const filePath = absolutePath(conversation._id, message.attachment.storedName);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'The file is no longer available' });
    }

    const { originalName, mimeType } = message.attachment;
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // only images are shown inside the page; everything else is a download
    const showInline = req.query.download !== '1' && INLINE_TYPES.has(mimeType);
    if (showInline) {
      res.type(mimeType);
      res.setHeader('Content-Disposition', 'inline');
    } else {
      res.attachment(originalName);
    }

    res.sendFile(filePath, (err) => {
      if (err && !res.headersSent) {
        res.status(500).json({ message: 'Could not send the file' });
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Error downloading file', error: error.message });
  }
};

module.exports = { requireConversationMember, uploadSingle, uploadFile, downloadFile };