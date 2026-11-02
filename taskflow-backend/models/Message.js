const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    conversation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
    },
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    // Text is required, unless the message shares a task or a file (the note is optional then)
    text: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
      required: function () {
        return !this.task && !(this.attachment && this.attachment.originalName);
      },
    },
    // A shared task, and its title at the moment it was shared
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', default: null },
    taskTitle: { type: String },
    // A shared file. "storedName" is the random name on disk and is never sent to clients.
    attachment: {
      _id: false,
      originalName: { type: String },
      storedName: { type: String, select: false },
      mimeType: { type: String },
      size: { type: Number },
    },
    readAt: { type: Date, default: null }, // null = the other person has not read it yet
  },
  { timestamps: true }
);

// fast "latest messages of this conversation" queries
messageSchema.index({ conversation: 1, createdAt: -1 });
// fast "where was this task shared?" queries
messageSchema.index({ task: 1 });

module.exports = mongoose.model('Message', messageSchema);