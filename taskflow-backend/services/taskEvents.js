const Message = require('../models/Message');
const Conversation = require('../models/Conversation');

// value can be an id or a populated user object
const idOf = (value) => (value && value._id ? value._id : value);

// Everyone who should hear about changes to this task
const getRecipientIds = async (task) => {
  const ids = new Set();

  [task.createdBy, task.assignedTo].forEach((value) => {
    const id = idOf(value);
    if (id) ids.add(id.toString());
  });

  // plus both people of every conversation where the task was shared
  const conversationIds = await Message.distinct('conversation', { task: task._id });
  if (conversationIds.length > 0) {
    const conversations = await Conversation.find({
      _id: { $in: conversationIds },
    }).select('participants');
    conversations.forEach((c) =>
      c.participants.forEach((p) => ids.add(p.toString()))
    );
  }

  return [...ids];
};

const emitToUsers = (io, userIds, event, payload) => {
  if (!io) return;
  userIds.forEach((id) => io.to(`user:${id}`).emit(event, payload));
};

// The same small shape that chat messages carry for a shared task
const toTaskSummary = (task) => ({
  _id: task._id,
  title: task.title,
  status: task.status,
  priority: task.priority,
  dueDate: task.dueDate,
  assignedTo: task.assignedTo
    ? { _id: task.assignedTo._id, name: task.assignedTo.name }
    : null,
});

// task.assignedTo must already be populated. Never lets a failure break the request.
const emitTaskUpdated = async (io, task) => {
  try {
    const recipients = await getRecipientIds(task);
    emitToUsers(io, recipients, 'task:updated', toTaskSummary(task));
  } catch (error) {
    console.error('Failed to emit task:updated:', error.message);
  }
};

module.exports = { getRecipientIds, emitToUsers, emitTaskUpdated };