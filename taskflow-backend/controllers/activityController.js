const mongoose = require('mongoose');
const Task = require('../models/Task');
const TaskActivity = require('../models/TaskActivity');
const { logActivity, getTaskAudience } = require('../services/activityService');
const { emitToUsers } = require('../services/taskEvents');
const { notifyUsers } = require('../services/notificationService');

// Loads the task, but only for Admin / creator / assignee.
// (Someone who only saw the task through a chat card gets no access to its activity.)
// Sends the error response itself and returns null when access is not allowed.
const loadTaskForMember = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    res.status(404).json({ message: 'Task not found' });
    return null;
  }

  const task = await Task.findById(req.params.id);
  if (!task) {
    res.status(404).json({ message: 'Task not found' });
    return null;
  }

  const userId = req.user._id.toString();
  const allowed =
    req.user.role === 'Admin' ||
    task.createdBy?.toString() === userId ||
    task.assignedTo?.toString() === userId;

  if (!allowed) {
    res.status(403).json({ message: 'You are not allowed to see this task\'s activity' });
    return null;
  }

  return task;
};

// GET /api/tasks/:id/activity — the timeline, oldest first (latest 200 entries)
const getActivity = async (req, res) => {
  try {
    const task = await loadTaskForMember(req, res);
    if (!task) return;

    const found = await TaskActivity.find({ task: task._id })
      .sort({ createdAt: -1, _id: -1 })
      .limit(200)
      .populate('actor', 'name');

    res.json(found.reverse());
  } catch (error) {
    res.status(500).json({ message: 'Error fetching activity', error: error.message });
  }
};

// POST /api/tasks/:id/comments  { text }
const addComment = async (req, res) => {
  try {
    const task = await loadTaskForMember(req, res);
    if (!task) return;

    const text = typeof req.body.text === 'string' ? req.body.text.trim() : '';
    if (!text) {
      return res.status(400).json({ message: 'Comment cannot be empty' });
    }
    if (text.length > 1000) {
      return res.status(400).json({ message: 'Comment is too long (max 1000 characters)' });
    }

    const io = req.app.get('io');
    const created = await logActivity(io, task, req.user, { kind: 'comment', text });
    if (created.length === 0) {
      return res.status(500).json({ message: 'Could not save the comment' });
    }

    // tell the creator and the assignee (never the author)
    await notifyUsers(io, [task.createdBy, task.assignedTo], {
      type: 'task_commented',
      actor: req.user,
      task,
      taskTitle: task.title,
    });

    res.status(201).json({
      ...created[0].toObject(),
      actor: { _id: req.user._id, name: req.user.name },
    });
  } catch (error) {
    res.status(500).json({ message: 'Error adding comment', error: error.message });
  }
};

// DELETE /api/tasks/:id/comments/:commentId — the author or an Admin
const deleteComment = async (req, res) => {
  try {
    const task = await loadTaskForMember(req, res);
    if (!task) return;

    if (!mongoose.Types.ObjectId.isValid(req.params.commentId)) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const comment = await TaskActivity.findOne({
      _id: req.params.commentId,
      task: task._id,
      kind: 'comment',
    });
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }

    const isAdmin = req.user.role === 'Admin';
    const isAuthor = comment.actor.toString() === req.user._id.toString();
    if (!isAdmin && !isAuthor) {
      return res.status(403).json({ message: 'You can only delete your own comments' });
    }

    await comment.deleteOne();

    const audience = await getTaskAudience(task);
    emitToUsers(req.app.get('io'), audience, 'activity:deleted', {
      taskId: task._id.toString(),
      activityId: comment._id.toString(),
    });

    res.json({ message: 'Comment deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting comment', error: error.message });
  }
};

module.exports = { getActivity, addComment, deleteComment };