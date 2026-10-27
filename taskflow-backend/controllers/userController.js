const mongoose = require('mongoose');
const User = require('../models/User');

// never send the password hash to the client
const toSafeUser = (user) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive !== false,
  createdAt: user.createdAt,
});

// GET /api/users — Admin sees everyone, Member sees active users only
const getUsers = async (req, res) => {
  try {
    const filter =
      req.user.role === 'Admin' ? {} : { isActive: { $ne: false } };

    const users = await User.find(filter).sort({ name: 1 });
    res.json(users.map(toSafeUser));
  } catch (error) {
    res.status(500).json({ message: 'Error fetching users', error: error.message });
  }
};

// GET /api/users/me — the logged-in user's current data
const getMe = async (req, res) => {
  res.json(toSafeUser(req.user));
};

// PUT /api/users/me — update my own name and/or email
const updateMe = async (req, res) => {
  try {
    const { name, email } = req.body;
    const user = await User.findById(req.user._id);

    if (name !== undefined) {
      if (!String(name).trim()) {
        return res.status(400).json({ message: 'Name cannot be empty' });
      }
      user.name = String(name).trim();
    }

    if (email !== undefined) {
      const cleanEmail = String(email).trim().toLowerCase(); 
      if (!cleanEmail) {
        return res.status(400).json({ message: 'Email cannot be empty' });
      }
      if (cleanEmail !== user.email) {
        const taken = await User.findOne({
          email: cleanEmail,
          _id: { $ne: user._id },
        });
        if (taken) {
          return res.status(400).json({ message: 'Email already in use' });
        }
        user.email = cleanEmail;
      }
    }

    await user.save();
    res.json(toSafeUser(user));
  } catch (error) {
    res.status(400).json({ message: 'Error updating profile', error: error.message });
  }
};

// PUT /api/users/me/password — change my own password
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: 'Current and new password are required' });
    }
    if (newPassword.length < 8) {
      return res
        .status(400)
        .json({ message: 'New password must be at least 8 characters' });
    }

    const user = await User.findById(req.user._id);

    // 400, not 401: a wrong current password must not look like an expired session
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ message: 'Current password is incorrect' });
    }
    if (newPassword === currentPassword) {
      return res
        .status(400)
        .json({ message: 'New password must be different from the current one' });
    }

    user.password = newPassword; // hashed by the pre('save') hook
    await user.save();

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error changing password', error: error.message });
  }
};

// POST /api/users — Admin creates a new team member
const createUser = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name?.trim() || !email?.trim() || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (role !== undefined && !['Admin', 'Member'].includes(role)) {
      return res.status(400).json({ message: 'Role must be Admin or Member' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const exists = await User.findOne({ email: cleanEmail });
    if (exists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const user = await User.create({
      name: name.trim(),
      email: cleanEmail,
      password, // hashed by the pre('save') hook
      role: role || 'Member',
    });

    res.status(201).json(toSafeUser(user));
  } catch (error) {
    res.status(500).json({ message: 'Error creating user', error: error.message });
  }
};

// PUT /api/users/:id — Admin changes role and/or active status
const updateUser = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const { role, isActive } = req.body;
    const isSelf = user._id.toString() === req.user._id.toString();

    if (role !== undefined && !['Admin', 'Member'].includes(role)) {
      return res.status(400).json({ message: 'Role must be Admin or Member' });
    }
    if (isActive !== undefined && typeof isActive !== 'boolean') {
      return res.status(400).json({ message: 'isActive must be true or false' });
    }

    // Stop an Admin from locking themselves out
    if (isSelf && ((role !== undefined && role !== user.role) || isActive === false)) {
      return res
        .status(400)
        .json({ message: 'You cannot change your own role or deactivate yourself' });
    }

    if (role !== undefined) user.role = role;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();
    // NEW: kick a deactivated user out of any open chat connections
    if (isActive === false) {
      req.app.get('io')?.in(`user:${user._id}`).disconnectSockets(true);
    }

    res.json(toSafeUser(user));
  } catch (error) {
    res.status(400).json({ message: 'Error updating user', error: error.message });
  }
};

module.exports = { getUsers, getMe, updateMe, changePassword, createUser, updateUser };