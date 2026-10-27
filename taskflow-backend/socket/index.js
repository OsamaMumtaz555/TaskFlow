const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const {
  saveMessage,
  getConversationForUser,
} = require('../services/chatService');

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: { origin: process.env.CLIENT_URL || 'http://localhost:5173' },
  });

  // userId -> number of open connections (one person can have several tabs)
  const onlineUsers = new Map();

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

    // ---- Presence ----
    const connections = (onlineUsers.get(userId) || 0) + 1;
    onlineUsers.set(userId, connections);
    if (connections === 1) {
      io.emit('presence:update', { userId, online: true }); // first tab opened
    }

    // client -> server: "who is online right now?"
    socket.on('presence:get', (ack) => {
      if (typeof ack === 'function') ack([...onlineUsers.keys()]);
    });

    // ---- Messages ----
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

    // ---- Typing ----
    // conversationId -> the other person's id (checked once, then remembered)
    const typingTargets = new Map();

    socket.on('typing', async (payload) => {
      try {
        const { conversationId, isTyping } = payload || {};
        if (typeof conversationId !== 'string') return;

        let targetId = typingTargets.get(conversationId);
        if (!targetId) {
          const conversation = await getConversationForUser(conversationId, userId);
          if (!conversation) return; // not a participant: ignore silently

          const other = conversation.participants.find(
            (p) => p.toString() !== userId
          );
          if (!other) return;
          targetId = other.toString();
          typingTargets.set(conversationId, targetId);
        }

        io.to(`user:${targetId}`).emit('typing', {
          conversationId,
          userId,
          isTyping: Boolean(isTyping),
        });
      } catch (error) {
        // typing is best-effort, never crash the connection
      }
    });

    // ---- Disconnect ----
    socket.on('disconnect', () => {
      const remaining = (onlineUsers.get(userId) || 1) - 1;
      if (remaining <= 0) {
        onlineUsers.delete(userId);
        io.emit('presence:update', { userId, online: false }); // last tab closed
      } else {
        onlineUsers.set(userId, remaining);
      }
    });
  });

  return io;
};

module.exports = { initSocket };