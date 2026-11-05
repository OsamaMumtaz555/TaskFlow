const crypto = require('crypto');
const User = require('../models/User');
const { getConversationForUser, saveCallMessage } = require('../services/chatService');

// An unanswered call stops ringing after this long
const RING_TIMEOUT_MS = Number(process.env.CALL_RING_TIMEOUT_MS) || 30 * 1000;
// WebRTC messages (offers, answers, ICE candidates) are small; refuse anything huge
const MAX_SIGNAL_SIZE = 64 * 1024; 

// callId -> call, and userId -> the callId they are in (a person is in at most one call)
const calls = new Map();
const userCalls = new Map();

// Ends a call and tells both people (all of their open tabs)
const endCall = (io, call, reason) => {
  if (!calls.has(call.id)) return; // already ended

  clearTimeout(call.ringTimer);
  calls.delete(call.id);
  userCalls.delete(call.callerId);
  userCalls.delete(call.calleeId);

  const duration = call.answeredAt
    ? Math.round((Date.now() - call.answeredAt) / 1000)
    : 0;

  const payload = {
    callId: call.id,
    conversationId: call.conversationId,
    type: call.type,
    reason, // hangup | rejected | cancelled | missed | disconnected
    duration, // seconds, 0 if it was never answered
  };
  io.to(`user:${call.callerId}`).emit('call:ended', payload);
  io.to(`user:${call.calleeId}`).emit('call:ended', payload);

  
  // write the call into the chat history ("Voice call · 12:34", "Missed voice call"...)
  saveCallMessage({
    conversationId: call.conversationId,
    callerId: call.callerId,
    type: call.type,
    reason,
    duration,
  })
    .then((saved) => {
      if (!saved) return;
      saved.conversation.participants.forEach((participantId) => {
        io.to(`user:${participantId}`).emit('message:new', saved.message);
      });
    })
    .catch((error) => console.error('Failed to log the call:', error.message));
};

const registerCallHandlers = (io, socket, onlineUsers) => {
  const userId = socket.user._id.toString();
  const room = (id) => `user:${id}`;

  // ---- caller: "I want to call this conversation's other person" ----
  socket.on('call:invite', async (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    try {
      const { conversationId, type } = payload || {};
      if (!['audio', 'video'].includes(type)) {
        return reply({ ok: false, error: 'Invalid call type' });
      }

      const conversation = await getConversationForUser(conversationId, userId);
      if (!conversation) {
        return reply({ ok: false, error: 'Conversation not found' });
      }

      const calleeId = conversation.participants
        .find((p) => p.toString() !== userId)
        ?.toString();
      const callee = calleeId && (await User.findById(calleeId).select('isActive'));
      if (!callee || callee.isActive === false) {
        return reply({ ok: false, error: 'This user is no longer active' });
      }

      // checked AFTER the database calls, right before the call is registered
      if (userCalls.has(userId)) {
        return reply({ ok: false, error: 'You are already in a call' });
      }
      if (!onlineUsers.has(calleeId)) {
        return reply({ ok: false, error: 'This user is offline' });
      }
      if (userCalls.has(calleeId)) {
        return reply({ ok: false, error: 'This user is busy on another call' });
      }

      const call = {
        id: crypto.randomUUID(),
        conversationId: conversation._id.toString(),
        callerId: userId,
        calleeId,
        type,
        state: 'ringing',
        callerSocket: socket.id, // the tab that holds the caller's side
        calleeSocket: null, // set when a tab of the callee accepts
        answeredAt: null,
        ringTimer: null,
      };
      calls.set(call.id, call);
      userCalls.set(userId, call.id);
      userCalls.set(calleeId, call.id);

      // nobody answered in time: missed
      call.ringTimer = setTimeout(() => {
        const current = calls.get(call.id);
        if (current && current.state === 'ringing') endCall(io, current, 'missed');
      }, RING_TIMEOUT_MS);

      // ring every open tab of the callee
      io.to(room(calleeId)).emit('call:incoming', {
        callId: call.id,
        conversationId: call.conversationId,
        type,
        caller: { _id: userId, name: socket.user.name },
      });

      reply({ ok: true, callId: call.id });
    } catch (error) {
      reply({ ok: false, error: error.message });
    }
  });

  // ---- callee: "I pick up" ----
  socket.on('call:accept', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const call = calls.get(payload?.callId);

    if (!call || call.calleeId !== userId || call.state !== 'ringing') {
      return reply({ ok: false, error: 'This call is no longer available' });
    }

    clearTimeout(call.ringTimer);
    call.state = 'active';
    call.answeredAt = Date.now();
    call.calleeSocket = socket.id; // this tab now holds the callee's side

    // the caller can now create the WebRTC offer
    io.to(room(call.callerId)).emit('call:accepted', { callId: call.id });
    // the callee's OTHER tabs stop ringing
    socket.to(room(userId)).emit('call:handled', { callId: call.id });

    reply({ ok: true });
  });

  // ---- either person: hang up / decline / cancel ----
  socket.on('call:hangup', (payload, ack) => {
    const reply = typeof ack === 'function' ? ack : () => {};
    const call = calls.get(payload?.callId);

    if (!call || (call.callerId !== userId && call.calleeId !== userId)) {
      return reply({ ok: false, error: 'Call not found' });
    }

    let reason = 'hangup';
    if (call.state === 'ringing') {
      reason = call.callerId === userId ? 'cancelled' : 'rejected';
    }
    endCall(io, call, reason);
    reply({ ok: true });
  });

  // ---- WebRTC messages (offer, answer, ICE candidates), passed on untouched ----
  socket.on('webrtc:signal', (payload) => {
    const { callId, data } = payload || {};
    const call = calls.get(callId);
    if (!call || call.state !== 'active') return;
    if (call.callerId !== userId && call.calleeId !== userId) return;

    // only the tab that holds my side of the call may signal
    const mySocket = call.callerId === userId ? call.callerSocket : call.calleeSocket;
    if (mySocket !== socket.id) return;

    if (!data || typeof data !== 'object') return;
    if (JSON.stringify(data).length > MAX_SIGNAL_SIZE) return;

    const otherId = call.callerId === userId ? call.calleeId : call.callerId;
    io.to(room(otherId)).emit('webrtc:signal', { callId, data });
  });

  // ---- "I muted my microphone / turned my camera off" (for the other person's screen) ----
  socket.on('call:media', (payload) => {
    const { callId, audio, video, screen } = payload || {};
    const call = calls.get(callId);
    if (!call || call.state !== 'active') return;
    if (call.callerId !== userId && call.calleeId !== userId) return;

    const otherId = call.callerId === userId ? call.calleeId : call.callerId;
    io.to(room(otherId)).emit('call:media', {
      callId,
      audio: Boolean(audio),
      video: Boolean(video),
      screen: Boolean(screen),
    });
  });

  // ---- the tab holding the call closed or lost its connection ----
  socket.on('disconnect', () => {
    const callId = userCalls.get(userId);
    const call = callId && calls.get(callId);
    if (!call) return;

    if (call.callerSocket === socket.id) {
      endCall(io, call, call.state === 'ringing' ? 'cancelled' : 'disconnected');
    } else if (call.calleeSocket === socket.id) {
      endCall(io, call, 'disconnected');
    }
  });
};

module.exports = { registerCallHandlers };