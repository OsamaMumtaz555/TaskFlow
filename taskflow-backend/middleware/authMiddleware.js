const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Middleware to check if the request has a valid JWT token
const protect = async (req, res, next) => {
  let token;

  // Tokens are sent in the format: "Bearer <token>" inside the Authorization header
  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    try {
      // Extract just the token part (remove "Bearer ")
      token = req.headers.authorization.split(' ')[1];

      // Verify the token is valid and not tampered with
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find the user by the ID stored in the token, exclude the password field
      req.user = await User.findById(decoded.id).select('-password');
    } catch (error) {
      return res.status(401).json({ message: 'Not authorized, token failed' });
    }

    // The account may have been deleted since the token was issued
    if (!req.user) {
      return res.status(401).json({ message: 'Not authorized, user no longer exists' });
    }

    // The account may have been deactivated by an Admin
    if (req.user.isActive === false) {
      return res.status(401).json({ message: 'Your account has been deactivated' });
    }

    return next(); // token is valid and the account is active, so the request continues
  }

  return res.status(401).json({ message: 'Not authorized, no token provided' });
};

// Middleware to restrict access to specific roles
const adminOnly = (req, res, next) => {
  if (req.user && req.user.role === 'Admin') {
    next();
  } else {
    res.status(403).json({ message: 'Access denied — Admins only' });
  }
};

module.exports = { protect, adminOnly };