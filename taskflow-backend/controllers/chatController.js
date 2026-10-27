const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');
const { getConversationForUser, markRead } = require('../services/chatService');

// Shape sent to the frontend: the OTHER person, a preview and the unread count
const formatConversation = (conv, myId, unreadCount = 0) => {
  const other = conv.participants.find(
    (p) => p._id.toString() !== myId.toString()
  );
  const hasMessage = Boolean(conv.lastMessage && conv.lastMessage.text);

  return {
    _id: conv._id,
    other: other
      ? {
          _id: other._id,
          name: other.name,
          email: other.email,
          role: other.role,
          isActive: other.isActive !== false,
        }
      : null,
    lastMessage: hasMessage
      ? {
          text: conv.lastMessage.text,
          sender: conv.lastMessage.sender,
          sentAt: conv.lastMessage.sentAt,
        }
      : null,
    lastMessageAt: conv.lastMessageAt,
    unreadCount,
  };
};

// GET /api/chats — all my conversations, newest activity first
const getChats = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participants: req.user._id })
      .populate('participants', 'name email role isActive')
      .sort({ lastMessageAt: -1 });

    const ids = conversations.map((c) => c._id);
    const unread = await Message.aggregate([
      {
        $match: {
          conversation: { $in: ids },
          sender: { $ne: req.user._id },
          readAt: null,
        },
      },
      { $group: { _id: '$conversation', count: { $sum: 1 } } },
    ]);
    const unreadMap = new Map(unread.map((u) => [u._id.toString(), u.count]));

    res.json(
      conversations.map((c) =>
        formatConversation(c, req.user._id, unreadMap.get(c._id.toString()) || 0)
      )
    );
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chats', error: error.message });
  }
};

// GET /api/chats/unread-count — total unread messages across all my conversations
const getUnreadCount = async (req, res) => {
  try {
    const conversationIds = await Conversation.distinct('_id', {
      participants: req.user._id,
    });

    const count = await Message.countDocuments({
      conversation: { $in: conversationIds },
      sender: { $ne: req.user._id },
      readAt: null,
    });

    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching unread count', error: error.message });
  }
};

// POST /api/chats  { userId } — open (or create) my conversation with that user
const startChat = async (req, res) => {
  try {
    const { userId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'A valid userId is required' });
    }
    if (userId === req.user._id.toString()) {
      return res.status(400).json({ message: 'You cannot chat with yourself' });
    }

    const other = await User.findOne({ _id: userId, isActive: { $ne: false } });
    if (!other) {
      return res.status(404).json({ message: 'User not found' });
    }

    const key = [req.user._id.toString(), userId].sort().join('_');
    let conversation = await Conversation.findOne({ participantsKey: key });

    if (!conversation) {
      try {
        conversation = await Conversation.create({
          participants: [req.user._id, other._id],
          participantsKey: key,
        });
      } catch (err) {
        // two requests at the same moment: the unique key stops the duplicate
        if (err.code === 11000) {
          conversation = await Conversation.findOne({ participantsKey: key });
        } else {
          throw err;
        }
      }
    }

    await conversation.populate('participants', 'name email role isActive');
    const unread = await Message.countDocuments({
      conversation: conversation._id,
      sender: { $ne: req.user._id },
      readAt: null,
    });

    res.json(formatConversation(conversation, req.user._id, unread));
  } catch (error) {
    res.status(500).json({ message: 'Error starting chat', error: error.message });
  }
};

// GET /api/chats/:id/messages?before=<ISO date>&limit=30 — history, oldest first
const getMessages = async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user._id);
    if (!conversation) {
      return res.status(404).json({ message: 'Conversation not found' });
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 100);
    const filter = { conversation: conversation._id };

    if (req.query.before) {
      const before = new Date(req.query.before);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({ message: 'Invalid "before" date' });
      }
      filter.createdAt = { $lt: before };
    }

    // fetch one extra to know whether older messages exist
    const found = await Message.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('sender', 'name');

    const hasMore = found.length > limit;
    const messages = found.slice(0, limit).reverse();

    res.json({ messages, hasMore });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching messages', error: error.message });
  }
};

// PUT /api/chats/:id/read — mark the other person's messages as read
const markConversationRead = async (req, res) => {
  try {
    const result = await markRead(req.params.id, req.user._id);
    if (!result) {
      return res.status(404).json({ message: 'Conversation not found' });
    }
    res.json({ updated: result.updated });
  } catch (error) {
    res.status(500).json({ message: 'Error marking as read', error: error.message });
  }
};

module.exports = {
  getChats,
  getUnreadCount,
  startChat,
  getMessages,
  markConversationRead,
};