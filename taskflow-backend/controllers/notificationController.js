const mongoose = require('mongoose');
const Notification = require('../models/Notification');

// GET /api/notifications?limit=20&before=<ISO date> — my notifications, newest first
const getNotifications = async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 50);
    const filter = { user: req.user._id };

    if (req.query.before) {
      const before = new Date(req.query.before);
      if (Number.isNaN(before.getTime())) {
        return res.status(400).json({ message: 'Invalid "before" date' });
      }
      filter.createdAt = { $lt: before };
    }

    // fetch one extra to know whether older ones exist
    const found = await Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .populate('actor', 'name');

    const hasMore = found.length > limit;
    const notifications = found.slice(0, limit);
    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      readAt: null,
    });

    res.json({ notifications, hasMore, unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
};

// PUT /api/notifications/:id/read — mark one of MY notifications as read
const markRead = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    const mine = await Notification.exists({
      _id: req.params.id,
      user: req.user._id,
    });
    if (!mine) {
      return res.status(404).json({ message: 'Notification not found' });
    }

    await Notification.updateOne(
      { _id: req.params.id, readAt: null },
      { readAt: new Date() }
    );

    const unreadCount = await Notification.countDocuments({
      user: req.user._id,
      readAt: null,
    });
    res.json({ unreadCount });
  } catch (error) {
    res.status(500).json({ message: 'Error updating notification', error: error.message });
  }
};

// PUT /api/notifications/read-all — mark all of MY notifications as read
const markAllRead = async (req, res) => {
  try {
    const result = await Notification.updateMany(
      { user: req.user._id, readAt: null },
      { readAt: new Date() }
    );
    res.json({ updated: result.modifiedCount, unreadCount: 0 });
  } catch (error) {
    res.status(500).json({ message: 'Error updating notifications', error: error.message });
  }
};

module.exports = { getNotifications, markRead, markAllRead };