const User = require('../models/User');
const generateToken = require('../utils/generateToken');

// REGISTER — create a new user
const registerUser = async (req, res) => {
  try {
    const { name, password } = req.body; // role is never read from the client
    const email = req.body.email?.trim().toLowerCase();

    if (!name?.trim() || !email || !password) {
      return res.status(400).json({ message: 'Name, email and password are required' });
    }
    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    // Check if a user with this email already exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // role is not passed, so the schema default 'Member' always applies
    const user = await User.create({ name: name.trim(), email, password });

    res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error registering user', error: error.message });
  }
};

// LOGIN — verify credentials and return a token
const loginUser = async (req, res) => {
  try {
    const { password } = req.body;
    const email = req.body.email?.trim().toLowerCase();

    if (!email || !password) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Find the user by email
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Check if the entered password matches the hashed one
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Deactivated accounts cannot log in
    if (user.isActive === false) {
      return res
        .status(403)
        .json({ message: 'Your account has been deactivated. Contact an administrator.' });
    }

    // Credentials correct — send back user info + token
    res.json({
      _id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    res.status(500).json({ message: 'Error logging in', error: error.message });
  }
};

module.exports = { registerUser, loginUser };