// Import mongoose to define our schema
const mongoose = require('mongoose');

// Define the "shape" of a Task document
const taskSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
  },
  status: {
    type: String,
    enum: ['Pending', 'In Progress', 'Completed'], // only these 3 values allowed
    default: 'Pending',
  },
}, {
  timestamps: true, // automatically adds createdAt and updatedAt fields
});

// Create the model — this gives us a "Task" object we can use to interact with the database
const Task = mongoose.model('Task', taskSchema);

module.exports = Task;