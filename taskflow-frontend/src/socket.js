import { io } from "socket.io-client";

// Same server as the API (without the /api part)
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

let socket = null;

// Code that lives for the whole session (like the call manager) can follow the socket
const listeners = new Set();
const notify = () => listeners.forEach((listener) => listener(socket));

// listener(socket) is called now, and again whenever the socket is created, replaced or closed
export const onSocketChange = (listener) => {
  listeners.add(listener);
  listener(socket);
  return () => {
    listeners.delete(listener);
  };
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
    notify();
  }
};

// Returns the one shared socket for the logged-in user (null if logged out).
// If a different user logged in, the old connection is closed and a new one is made.
export const getSocket = () => {
  const token = localStorage.getItem("token");

  if (!token) {
    disconnectSocket();
    return null;
  }

  if (socket && socket.auth.token === token) return socket;

  disconnectSocket();
  socket = io(SOCKET_URL, { auth: { token } });

  // Dev only: lets you simulate a dropped connection from the browser console
  if (import.meta.env.DEV) window.__socket = socket;

  notify();
  return socket;
};