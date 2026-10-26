const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define the shape of a User document
const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true, // no two users can have the same email
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['Admin', 'Member'],
    default: 'Member',
  },
  isActive: {
    type: Boolean,
    default: true, // false = account deactivated (cannot log in)
  },
}, {
  timestamps: true,
});

// This runs automatically BEFORE a user document is saved
userSchema.pre('save', async function () {
  // Only hash the password if it's new or being changed
  if (!this.isModified('password')) {
    return;
  }
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// Custom method to compare a plain-text password with the hashed one
userSchema.methods.comparePassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

const User = mongoose.model('User', userSchema);

module.exports = User;