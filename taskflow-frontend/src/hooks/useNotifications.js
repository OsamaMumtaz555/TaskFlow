import { useState, useEffect, useRef } from "react";
import api from "../api/api";
import { getSocket } from "../socket";

// onNew(notification) is called whenever a live notification arrives (used for the toast)
export default function useNotifications(onNew) {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);

  // always call the latest onNew without re-subscribing
  const onNewRef = useRef(onNew);
  useEffect(() => {
    onNewRef.current = onNew;
  });

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await api.get("/notifications", { params: { limit: 20 } });
        if (cancelled) return;
        setNotifications(data.notifications);
        setHasMore(data.hasMore);
        setUnreadCount(data.unreadCount);
      } catch (err) {
        console.error("Failed to load notifications:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    const socket = getSocket();

    const handleNew = (notification) => {
      setNotifications((prev) =>
        prev.some((n) => n._id === notification._id) ? prev : [notification, ...prev]
      );
      setUnreadCount((count) => count + 1);
      onNewRef.current?.(notification);
    };

    socket?.on("notification:new", handleNew);
    socket?.io.on("reconnect", load); // catch up on anything missed while offline

    return () => {
      cancelled = true;
      socket?.off("notification:new", handleNew);
      socket?.io.off("reconnect", load);
    };
  }, []);

  const markRead = async (id) => {
    const target = notifications.find((n) => n._id === id);
    if (!target || target.readAt) return;

    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, readAt: new Date().toISOString() } : n))
    );
    setUnreadCount((count) => Math.max(0, count - 1));

    try {
      await api.put(`/notifications/${id}/read`);
    } catch (err) {
      console.error("Failed to mark notification as read:", err);
    }
  };

  const markAllRead = async () => {
    if (unreadCount === 0) return;

    const now = new Date().toISOString();
    setNotifications((prev) => prev.map((n) => (n.readAt ? n : { ...n, readAt: now })));
    setUnreadCount(0);

    try {
      await api.put("/notifications/read-all");
    } catch (err) {
      console.error("Failed to mark all as read:", err);
    }
  };

  const loadMore = async () => {
    if (notifications.length === 0) return;
    try {
      const { data } = await api.get("/notifications", {
        params: {
          limit: 20,
          before: notifications[notifications.length - 1].createdAt,
        },
      });
      setNotifications((prev) => [...prev, ...data.notifications]);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error("Failed to load more notifications:", err);
    }
  };

  return {
    notifications,
    unreadCount,
    hasMore,
    loading,
    markRead,
    markAllRead,
    loadMore,
  };
}