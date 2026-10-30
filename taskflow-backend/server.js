// Import the Express library we just installed
const express = require('express');

// Import mongoose to connect to MongoDB
const mongoose = require('mongoose');

// Load environment variables from .env file
require('dotenv').config();

// Node's built-in HTTP server: Express and Socket.IO will share it
const http = require('http');
const { initSocket } = require('./socket');

// Create an Express application
const app = express();

// Middleware: allows the app to understand JSON sent in requests
app.use(express.json());

const cors = require("cors");

app.use(cors());

// Import our routes
const taskRoutes = require('./routes/taskRoutes');
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/userRoutes');
const chatRoutes = require('./routes/chatRoutes');
const notificationRoutes = require('./routes/notificationRoutes');

// Tell Express: any request starting with /api/tasks goes to taskRoutes
app.use('/api/tasks', taskRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/notifications', notificationRoutes);

// Define the port number the server will listen on
const PORT = process.env.PORT || 5000;

// A simple homepage route, just to confirm the server is alive
app.get('/', (req, res) => {
  res.send('TaskFlow backend is running!');
});

// Wrap Express in an HTTP server and attach Socket.IO to it
const server = http.createServer(app);
const io = initSocket(server);
app.set('io', io); // so controllers can reach the socket server later

// Connect to MongoDB, THEN start the server
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('MongoDB connected successfully');
    server.listen(PORT, () => {
      console.log(`Server is running on http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
  });