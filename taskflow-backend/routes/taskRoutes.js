const express = require('express');
const router = express.Router();

const {
  getAllTasks,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
} = require('../controllers/taskController');
const {
  getActivity,
  addComment,
  deleteComment,
} = require('../controllers/activityController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getAllTasks);
router.get('/:id', protect, getTaskById);
router.post('/', protect, createTask);
router.put('/:id', protect, updateTask);
router.delete('/:id', protect, deleteTask);

// comments and activity history of one task
router.get('/:id/activity', protect, getActivity);
router.post('/:id/comments', protect, addComment);
router.delete('/:id/comments/:commentId', protect, deleteComment);

module.exports = router;