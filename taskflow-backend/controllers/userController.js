const User = require('../models/User');

// GET /api/users — list of team members (any logged-in user, needed for the "assign to" dropdown)
const getUsers = async (req, res) => {
  try {
    const users = await User.find().select('_id name email role').sort({ name: 1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

module.exports = { getUsers };