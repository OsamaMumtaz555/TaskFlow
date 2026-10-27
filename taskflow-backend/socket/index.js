const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { saveMessage } = require('../services/chatService');

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
  });

  // Runs once for every new connection: same JWT as the REST API
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) return next(new Error('Not authorized, no token'));

      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      const user = await User.findById(decoded.id).select('-password');

      if (!user || user.isActive === false) {
        return next(new Error('Not authorized'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Not authorized, token failed'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user._id.toString();

    // Every user has a private room, so we can reach ALL of their open tabs
    socket.join(`user:${userId}`);

    // client -> server: send a message. "ack" tells the sender if it worked.
    socket.on('message:send', async (payload, ack) => {
      const reply = typeof ack === 'function' ? ack : () => {};
      try {
        const { conversationId, text } = payload || {};
        const { message, conversation } = await saveMessage({
          conversationId,
          senderId: userId,
          text,
        });

        // push to both people (the sender's other tabs included)
        conversation.participants.forEach((participantId) => {
          io.to(`user:${participantId}`).emit('message:new', message);
        });

        reply({ ok: true, message });
      } catch (error) {
        reply({ ok: false, error: error.message });
      }
    });
  });

  return io;
};

module.exports = { initSocket };