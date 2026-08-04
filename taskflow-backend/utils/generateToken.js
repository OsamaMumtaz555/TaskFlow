const jwt = require('jsonwebtoken');

// Generates a JWT containing the user's ID, signed with our secret key
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },           // payload: data stored inside the token
    process.env.JWT_SECRET,   // secret key used to sign the token
    { expiresIn: '30d' }      // token becomes invalid after 30 days
  );
};

module.exports = generateToken;