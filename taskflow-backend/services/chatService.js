const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const User = require('../models/User');

// Returns the conversation only if this user is one of its two participants
const getConversationForUser = async (conversationId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return null;
  return Conversation.findOne({ _id: conversationId, participants: userId });
};

// Validates, saves a message and updates the conversation preview
const saveMessage = async ({ conversationId, senderId, text }) => {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (!clean) throw new Error('Message cannot be empty');
  if (clean.length > 2000) throw new Error('Message is too long (max 2000 characters)');

  const conversation = await getConversationForUser(conversationId, senderId);
  if (!conversation) throw new Error('Conversation not found');

  // Don't allow messages to someone whose account was deactivated
  const otherId = conversation.participants.find(
    (p) => p.toString() !== senderId.toString()
  );
  const other = await User.findById(otherId).select('isActive');
  if (!other || other.isActive === false) {
    throw new Error('This user is no longer active');
  }

  const message = await Message.create({
    conversation: conversation._id,
    sender: senderId,
    text: clean,
  });

  conversation.lastMessage = {
    text: clean.slice(0, 100),
    sender: senderId,
    sentAt: message.createdAt,
  };
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  await message.populate('sender', 'name');
  return { message: message.toObject(), conversation };
};

// Marks everything the OTHER person sent in this conversation as read
const markRead = async (conversationId, userId) => {
  const conversation = await getConversationForUser(conversationId, userId);
  if (!conversation) return null;

  const result = await Message.updateMany(
    { conversation: conversation._id, sender: { $ne: userId }, readAt: null },
    { readAt: new Date() }
  );
  return { conversation, updated: result.modifiedCount };
};

module.exports = { getConversationForUser, saveMessage, markRead };