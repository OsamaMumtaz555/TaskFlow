const mongoose = require('mongoose');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Task = require('../models/Task');
const User = require('../models/User');

// What a message shows about its sender and a shared task (a summary, not the whole task)
const messagePopulate = [
  { path: 'sender', select: 'name' },
  {
    path: 'task',
    select: 'title status priority dueDate assignedTo',
    populate: { path: 'assignedTo', select: 'name' },
  },
];

// Returns the conversation only if this user is one of its two participants
const getConversationForUser = async (conversationId, userId) => {
  if (!mongoose.Types.ObjectId.isValid(conversationId)) return null;
  return Conversation.findOne({ _id: conversationId, participants: userId });
};

// Validates, saves a message and updates the conversation preview
const saveMessage = async ({ conversationId, senderId, text, taskId }) => {
  const clean = typeof text === 'string' ? text.trim() : '';
  if (clean.length > 2000) throw new Error('Message is too long (max 2000 characters)');

  // Sharing a task: you may only share a task you can see yourself
  let task = null;
  if (taskId) {
    if (!mongoose.Types.ObjectId.isValid(taskId)) throw new Error('Task not found');
    task = await Task.findById(taskId);
    if (!task) throw new Error('Task not found');

    const sender = await User.findById(senderId).select('role');
    const isAdmin = sender?.role === 'Admin';
    const isCreator = task.createdBy && task.createdBy.toString() === senderId.toString();
    const isAssignee = task.assignedTo && task.assignedTo.toString() === senderId.toString();

    if (!isAdmin && !isCreator && !isAssignee) {
      throw new Error('You can only share tasks you have access to');
    }
  }

  if (!clean && !task) throw new Error('Message cannot be empty');

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
    task: task ? task._id : null,
    taskTitle: task ? task.title : undefined,
  });

  conversation.lastMessage = {
    text: (clean || `📎 ${task.title}`).slice(0, 100),
    sender: senderId,
    sentAt: message.createdAt,
  };
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  await message.populate(messagePopulate);
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

module.exports = {
  messagePopulate,
  getConversationForUser,
  saveMessage,
  markRead,
};