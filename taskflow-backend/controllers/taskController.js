// Import the Task model
const Task = require('../models/Task');

// GET all tasks from the database
const getAllTasks = async (req, res) => {
  try {
    const tasks = await Task.find(); // fetches ALL tasks from MongoDB
    res.json(tasks);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching tasks', error: error.message });
  }
};

// POST — create a new task in the database
const createTask = async (req, res) => {
  try {
    const newTask = await Task.create(req.body); // saves to MongoDB
    res.status(201).json(newTask);
  } catch (error) {
    res.status(400).json({ message: 'Error creating task', error: error.message });
  }
};
// PUT — update an existing task by its ID
const updateTask = async (req, res) => {
  try {
    const updatedTask = await Task.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedTask) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json(updatedTask);
  } catch (error) {
    res.status(400).json({ message: 'Error updating task', error: error.message });
  }
};

// DELETE — remove a task by its ID
const deleteTask = async (req, res) => {
  try {
    const deletedTask = await Task.findByIdAndDelete(req.params.id);
    if (!deletedTask) {
      return res.status(404).json({ message: 'Task not found' });
    }
    res.json({ message: 'Task deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting task', error: error.message });
  }
};

module.exports = { getAllTasks, createTask, updateTask, deleteTask };