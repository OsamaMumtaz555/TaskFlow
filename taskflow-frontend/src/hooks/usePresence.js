import { useState, useEffect } from "react";
import { getSocket } from "../socket";

// Returns a Set with the ids of everyone who is online right now
export default function usePresence() {
  const [online, setOnline] = useState(() => new Set());

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const load = () =>
      socket.emit("presence:get", (ids) => setOnline(new Set(ids)));

    const onUpdate = ({ userId, online: isOnline }) =>
      setOnline((prev) => {
        const next = new Set(prev);
        if (isOnline) next.add(userId);
        else next.delete(userId);
        return next;
      });

    load();
    socket.on("connect", load); // fetch the list again after a reconnect
    socket.on("presence:update", onUpdate);

    return () => {
      socket.off("connect", load);
      socket.off("presence:update", onUpdate);
    };
  }, []);

  return online;
}