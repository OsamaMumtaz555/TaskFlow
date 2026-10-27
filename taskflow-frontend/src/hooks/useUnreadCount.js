import { useState, useEffect } from "react";
import api from "../api/api";
import { getSocket } from "../socket";

// Total unread chat messages, kept fresh live
export default function useUnreadCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    const refresh = async () => {
      try {
        const { data } = await api.get("/chats/unread-count");
        if (!cancelled) setCount(data.count);
      } catch (err) {
        console.error("Failed to load unread count:", err);
      }
    };

    refresh();

    const socket = getSocket();
    socket?.on("message:new", refresh);
    // The chat window announces this after it marked messages as read
    window.addEventListener("chat:read", refresh);

    return () => {
      cancelled = true;
      socket?.off("message:new", refresh);
      window.removeEventListener("chat:read", refresh);
    };
  }, []);

  return count;
}