const express = require('express');
const router = express.Router();

const {
  getUsers,
  getMe,
  updateMe,
  changePassword,
  createUser,
  updateUser,
} = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, getUsers);
router.post('/', protect, adminOnly, createUser);

// "me" routes must be declared BEFORE '/:id'
router.get('/me', protect, getMe);
router.put('/me', protect, updateMe);
router.put('/me/password', protect, changePassword);

router.put('/:id', protect, adminOnly, updateUser);

module.exports = router;