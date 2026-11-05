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
// attachment (optional): { originalName, storedName, mimeType, size } of an already saved file
const saveMessage = async ({ conversationId, senderId, text, taskId, attachment }) => {
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

  if (!clean && !task && !attachment) throw new Error('Message cannot be empty');

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
    attachment: attachment || undefined,
  });

  const preview =
    clean ||
    (attachment ? `📎 ${attachment.originalName}` : `📎 ${task.title}`);

  conversation.lastMessage = {
    text: preview.slice(0, 100),
    sender: senderId,
    sentAt: message.createdAt,
  };
  conversation.lastMessageAt = message.createdAt;
  await conversation.save();

  await message.populate(messagePopulate);

  // the name on disk must never reach a client
  const plain = message.toObject();
  if (plain.attachment) delete plain.attachment.storedName;

  return { message: plain, conversation };
};

// ---------- calls in the chat history ----------

// how a call ended -> the status shown in the chat
const CALL_STATUS = {
  hangup: 'completed',
  disconnected: 'completed',
  rejected: 'declined',
  cancelled: 'cancelled',
  missed: 'missed',
};

const formatDuration = (totalSeconds = 0) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

// The wording must match callPreview() in the frontend (utils/callHelpers.js)
const callPreviewText = (call) => {
  const label = call.type === 'video' ? 'video call' : 'voice call';
  const title = call.type === 'video' ? 'Video call' : 'Voice call';
  const icon = call.type === 'video' ? '🎥' : '📞';

  switch (call.status) {
    case 'completed':
      return `${icon} ${title} · ${formatDuration(call.duration)}`;
    case 'missed':
      return `${icon} Missed ${label}`;
    case 'cancelled':
      return `${icon} Cancelled ${label}`;
    case 'declined':
      return `${icon} Declined ${label}`;
    default:
      return `${icon} ${title}`;
  }
};

// Writes a call into the conversation as a message sent by the caller
const saveCallMessage = async ({ conversationId, callerId, type, reason, duration }) => {
  const conversation = await Conversation.findById(conversationId);
  if (!conversation) return null;

  const status = CALL_STATUS[reason] || 'missed';
  const call = { type, status, duration: status === 'completed' ? duration : 0 };

  // only calls the other person did NOT take count as unread
  const needsAttention = status === 'missed' || status === 'cancelled';

  const message = await Message.create({
    conversation: conversation._id,
    sender: callerId,
    text: '',
    call,
    readAt: needsAttention ? null : new Date(),
  });

  conversation.lastMessage = {
    text: callPreviewText(call),
    sender: callerId,
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
  saveCallMessage,
  markRead,
};