// Import the Express library we just installed
const express = require('express');

// Import mongoose to connect to MongoDB
const mongoose = require('mongoose');

// Load environment variables from .env file
require('dotenv').config();

// Create an Express application
const app = express();

// Middleware: allows the app to understand JSON sent in requests
app.use(express.json());

const cors = require("cors");

app.use(cors());

// Import our task routes
const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');  
const userRoutes = require('./routes/userRoutes');


// Tell Express: any request starting with /api/tasks goes to taskRoutes
app.use('/api/tasks', taskRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);

// Define the port number the server will listen on
const PORT = 5000;

// A simple homepage route, just to confirm the server is alive
app.get('/', (req, res) => {
  res.send('TaskFlow backend is running!');
});

// Connect to MongoDB, THEN start the server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected successfully');
    app.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
  });