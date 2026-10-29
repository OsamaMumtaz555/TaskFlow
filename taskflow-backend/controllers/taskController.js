// Import the models
const mongoose = require('mongoose');
const Task = require('../models/Task');
const User = require('../models/User');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const {
  getRecipientIds,
  emitToUsers,
  emitTaskUpdated,
} = require('../services/taskEvents');

// helper: fill in creator/assignee names on a task
const populateTask = (task) =>
  task.populate([
    { path: 'createdBy', select: 'name email' },
    { path: 'assignedTo', select: 'name email' },
  ]);

// helper: an assignee is valid if empty (unassigned) or an existing active user
const assigneeIsValid = async (id) => {
  if (!id) return true;
  if (!mongoose.Types.ObjectId.isValid(id)) return false;
  return !!(await User.exists({ _id: id, isActive: { $ne: false } }));
};

// GET tasks — Admin sees all; Member sees only tasks they created or are assigned to
const getAllTasks = async (req, res) => {
  try {
    const filter =
      req.user.role === 'Admin'
        ? {}
        : { $or: [{ createdBy: req.user._id }, { assignedTo: req.user._id }] };

    const tasks = await Task.find(filter)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 });

    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tasks', error: error.message });
  }
};

// GET one task — Admin, creator, assignee, OR someone it was shared with in a chat
const getTaskById = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const task = await Task.findById(req.params.id)
      .populate('createdBy', 'name email')
      .populate('assignedTo', 'name email');
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const userId = req.user._id.toString();
    const isAdmin = req.user.role === 'Admin';
    const isCreator = task.createdBy && task.createdBy._id.toString() === userId;
    const isAssignee = task.assignedTo && task.assignedTo._id.toString() === userId;
    const hasAccess = isAdmin || isCreator || isAssignee;

    if (!hasAccess) {
      // Not mine: only visible if it was shared in one of MY conversations
      const myConversationIds = await Conversation.distinct('_id', {
        participants: req.user._id,
      });
      const shared = await Message.exists({
        task: task._id,
        conversation: { $in: myConversationIds },
      });
      if (!shared) {
        return res.status(403).json({ message: 'You are not allowed to view this task' });
      }
    }

    res.json({ ...task.toObject(), readOnly: !hasAccess });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching task', error: error.message });
  }
};

// POST — create a new task in the database
const createTask = async (req, res) => {
  try {
    const {
      title,
      description,
      status,
      priority,
      dueDate,
      assignedTo,
      sourceMessageId,
    } = req.body;

    if (!(await assigneeIsValid(assignedTo))) {
      return res.status(400).json({ message: 'Assigned user does not exist' });
    }

    // Optional: the chat message this task was created from.
    // I must be one of the two people in that conversation.
    let sourceMessage = null;
    if (sourceMessageId) {
      if (!mongoose.Types.ObjectId.isValid(sourceMessageId)) {
        return res.status(400).json({ message: 'Invalid source message' });
      }
      const message = await Message.findById(sourceMessageId).select('conversation');
      const allowed =
        message &&
        (await Conversation.exists({
          _id: message.conversation,
          participants: req.user._id,
        }));
      if (!allowed) {
        return res.status(400).json({ message: 'Invalid source message' });
      }
      sourceMessage = message._id;
    }

    const newTask = await Task.create({
      title,
      description,
      status,
      priority,
      dueDate,
      assignedTo: assignedTo || null,
      sourceMessage,
      createdBy: req.user._id, // always taken from the verified token, never from the client
    });

    await populateTask(newTask);
    res.status(201).json(newTask);
  } catch (error) {
    res.status(400).json({ message: 'Error creating task', error: error.message });
  }
};

// PUT — update a task (permission-checked, whitelisted fields only)
const updateTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const userId = req.user._id.toString();
    const isAdmin = req.user.role === 'Admin';
    const isCreator = task.createdBy && task.createdBy.toString() === userId;
    const isAssignee = task.assignedTo && task.assignedTo.toString() === userId;

    if (!isAdmin && !isCreator && !isAssignee) {
      return res.status(403).json({ message: 'You are not allowed to edit this task' });
    }

    // Admin/creator can change everything below; assignee can only change status
    const canEditAll = isAdmin || isCreator;
    const allowedFields = canEditAll
      ? ['title', 'description', 'status', 'priority', 'dueDate', 'assignedTo']
      : ['status'];

    // Only validate the assignee if it is actually being changed,
    // so tasks already assigned to a deactivated user can still be edited
    if (canEditAll && req.body.assignedTo !== undefined) {
      const current = task.assignedTo ? task.assignedTo.toString() : '';
      const requested = req.body.assignedTo ? String(req.body.assignedTo) : '';
      if (requested !== current && !(await assigneeIsValid(requested))) {
        return res.status(400).json({ message: 'Assigned user does not exist' });
      }
    }

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        // an empty assignedTo / dueDate means "clear it"
        task[field] =
          (field === 'assignedTo' || field === 'dueDate') && !req.body[field]
            ? null
            : req.body[field];
      }
    });

    await task.save(); // runs schema validation
    await populateTask(task);

    // live update for shared task cards in chat
    await emitTaskUpdated(req.app.get('io'), task);

    res.json(task);
  } catch (error) {
    res.status(400).json({ message: 'Error updating task', error: error.message });
  }
};

// DELETE — Admin or the task's creator
const deleteTask = async (req, res) => {
  try {
    const task = await Task.findById(req.params.id);
    if (!task) {
      return res.status(404).json({ message: 'Task not found' });
    }

    const isAdmin = req.user.role === 'Admin';
    const isCreator =
      task.createdBy && task.createdBy.toString() === req.user._id.toString();

    if (!isAdmin && !isCreator) {
      return res.status(403).json({ message: 'You are not allowed to delete this task' });
    }

    // work out who to tell BEFORE the task disappears
    const recipients = await getRecipientIds(task);
    await task.deleteOne();
    emitToUsers(req.app.get('io'), recipients, 'task:deleted', {
      taskId: task._id.toString(),
    });

    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', error: error.message });
  }
};

module.exports = { getAllTasks, getTaskById, createTask, updateTask, deleteTask };