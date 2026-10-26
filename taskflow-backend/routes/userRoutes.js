const express = require('express');
const router = express.Router();

const { getUsers, createUser, updateUser } = require('../controllers/userController');
const { protect, adminOnly } = require('../middleware/authMiddleware');

router.get('/', protect, getUsers);
router.post('/', protect, adminOnly, createUser);
router.put('/:id', protect, adminOnly, updateUser);

module.exports = router; 