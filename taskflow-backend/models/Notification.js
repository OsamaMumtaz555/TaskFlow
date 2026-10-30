const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    // who receives it
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
           enum: [
        'task_assigned',
        'task_unassigned',
        'task_status_changed',
        'task_deleted',
        'task_commented',
      ],
      required: true,
    },
    // who caused it
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // the task (null once the task was deleted) and its title at that moment
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    taskTitle: { type: String },
    // only for task_status_changed
    fromStatus: { type: String },
    toStatus: { type: String },
    readAt: { type: Date, default: null }, // null = unread
  },
  { timestamps: true }
);

// my notifications, newest first
notificationSchema.index({ user: 1, createdAt: -1 });
// MongoDB deletes notifications automatically after 30 days
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = mongoose.model('Notification', notificationSchema);