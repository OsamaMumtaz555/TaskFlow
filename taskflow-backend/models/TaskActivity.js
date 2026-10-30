const mongoose = require('mongoose');

const KINDS = [
  'comment',
  'created',
  'title_changed',
  'description_changed',
  'status_changed',
  'priority_changed',
  'due_date_changed',
  'assigned',
  'reassigned',
  'unassigned',
];

const taskActivitySchema = new mongoose.Schema(
  {
    task: { type: mongoose.Schema.Types.ObjectId, ref: 'Task', required: true },
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: KINDS, required: true },
    // only for comments
    text: {
      type: String,
      trim: true,
      maxlength: 1000,
      required: function () {
        return this.kind === 'comment';
      },
    },
    // "from" and "to" values for changes (shown as text)
    from: { type: String },
    to: { type: String },
  },
  { timestamps: true }
);

// the timeline of one task, oldest first
taskActivitySchema.index({ task: 1, createdAt: 1 });

module.exports = mongoose.model('TaskActivity', taskActivitySchema);