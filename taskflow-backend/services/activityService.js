const TaskActivity = require('../models/TaskActivity');
const User = require('../models/User');

// Who may see a task's activity: its creator, its assignee and every active Admin
const getTaskAudience = async (task) => {
  const ids = new Set();

  [task.createdBy, task.assignedTo].forEach((value) => {
    const id = value && value._id ? value._id : value;
    if (id) ids.add(id.toString());
  });

  const admins = await User.find({
    role: 'Admin',
    isActive: { $ne: false },
  }).select('_id');
  admins.forEach((admin) => ids.add(admin._id.toString()));

  return [...ids];
};

// Saves one or several activity entries and pushes them live to the audience.
// Never lets a failure break the request that triggered it.
const logActivity = async (io, task, actor, entries) => {
  try {
    const list = Array.isArray(entries) ? entries : [entries];
    if (list.length === 0) return [];

    const created = await TaskActivity.insertMany(
      list.map((entry) => ({ task: task._id, actor: actor._id, ...entry }))
    );

    const audience = await getTaskAudience(task);
    created.forEach((doc) => {
      const payload = {
        ...doc.toObject(),
        actor: { _id: actor._id, name: actor.name },
      };
      audience.forEach((id) => io?.to(`user:${id}`).emit('activity:new', payload));
    });

    return created;
  } catch (error) {
    console.error('Failed to log activity:', error.message);
    return [];
  }
};

const dayOf = (value) => (value ? new Date(value).toISOString().slice(0, 10) : null);

// Compares a task before and after an update and describes what changed
// before/after: { title, description, status, priority, dueDate, assignee (id or null) }
// names: { from, to } = names of the old and new assignee
const buildChanges = (before, after, names) => {
  const changes = [];

  if (before.title !== after.title) {
    changes.push({ kind: 'title_changed', from: before.title, to: after.title });
  }
  if ((before.description || '') !== (after.description || '')) {
    changes.push({ kind: 'description_changed' });
  }
  if (before.status !== after.status) {
    changes.push({ kind: 'status_changed', from: before.status, to: after.status });
  }
  if (before.priority !== after.priority) {
    changes.push({ kind: 'priority_changed', from: before.priority, to: after.priority });
  }

  const beforeDue = dayOf(before.dueDate);
  const afterDue = dayOf(after.dueDate);
  if (beforeDue !== afterDue) {
    changes.push({
      kind: 'due_date_changed',
      from: beforeDue || 'none',
      to: afterDue || 'none',
    });
  }

  if (before.assignee !== after.assignee) {
    if (before.assignee && after.assignee) {
      changes.push({ kind: 'reassigned', from: names.from, to: names.to });
    } else if (after.assignee) {
      changes.push({ kind: 'assigned', to: names.to });
    } else {
      changes.push({ kind: 'unassigned', from: names.from });
    }
  }

  return changes;
};

module.exports = { getTaskAudience, logActivity, buildChanges };