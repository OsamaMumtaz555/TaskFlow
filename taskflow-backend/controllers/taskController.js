// Import the Task model
const Task = require('../models/Task');

// helper: fill in creator/assignee names on a task
const populateTask = (task) =>
  task.populate([
    { path: 'createdBy', select: 'name email' },
    { path: 'assignedTo', select: 'name email' },
  ]);

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

// POST — create a new task in the database
const createTask = async (req, res) => {
  try {
    const { title, description, status, priority, dueDate, assignedTo } = req.body;

    const newTask = await Task.create({
      title,
      description,
      status,
      priority,
      dueDate,
      assignedTo: assignedTo || null,
      createdBy: req.user._id, // always taken from the verified token, never from the client
    });

    await populateTask(newTask); // so createdBy/assignedTo come back as objects, like in getAllTasks
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
    const allowedFields =
      isAdmin || isCreator
        ? ['title', 'description', 'status', 'priority', 'dueDate', 'assignedTo']
        : ['status'];

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

    await task.deleteOne();
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', error: error.message });
  }
};

module.exports = { getAllTasks, createTask, updateTask, deleteTask }; 