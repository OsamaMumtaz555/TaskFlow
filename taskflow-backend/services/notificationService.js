const Notification = require('../models/Notification');

// io: the socket server | userIds: who could be notified | details: what happened
const notifyUsers = async (
  io,
  userIds,
  { type, actor, task, taskTitle, fromStatus, toStatus }
) => {
  try {
    const actorId = actor._id.toString();

    // unique ids, and never the person who did it
    const recipients = [...new Set(userIds.filter(Boolean).map(String))].filter(
      (id) => id !== actorId
    );
    if (recipients.length === 0) return;

    const created = await Notification.insertMany(
      recipients.map((user) => ({
        user,
        type,
        actor: actor._id,
        task: task ? task._id : null,
        taskTitle,
        fromStatus,
        toStatus,
      }))
    );

    // push each one live to its recipient (all of their open tabs)
    created.forEach((doc) => {
      const payload = {
        ...doc.toObject(),
        actor: { _id: actor._id, name: actor.name },
      };
      io?.to(`user:${doc.user}`).emit('notification:new', payload);
    });
  } catch (error) {
    console.error('Failed to create notifications:', error.message);
  }
};

module.exports = { notifyUsers };