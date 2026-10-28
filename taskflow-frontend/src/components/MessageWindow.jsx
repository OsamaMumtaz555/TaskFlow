import { useState, useEffect, useRef, useLayoutEffect } from "react";
import api from "../api/api";
import { getSocket } from "../socket";
import {
  initials,
  formatTime,
  isSameDay,
  dayLabel,
} from "../utils/chatHelpers";

const PAGE_SIZE = 30;

// Tells the sidebar to refresh its unread badge
const announceRead = () => window.dispatchEvent(new Event("chat:read"));

// Is the user really looking at this page right now?
const isViewing = () =>
  document.visibilityState === "visible" && document.hasFocus();

function MessageWindow({ conversation, currentUserId, isOnline, isTyping, onRead }) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [connected, setConnected] = useState(true);

  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  // What to do with the scrollbar after the next render:
  // "bottom" (show newest) or { restoreFrom } (keep position after loading older)
  const pendingScroll = useRef("bottom");
  // Typing state: are we currently "typing", when did we last tell the server, stop timer
  const typingRef = useRef({ active: false, lastEmit: 0, timer: null });
  // A message arrived while the tab was hidden and still has to be marked as read
  const unseenRef = useRef(false);
  // The latest messages, readable from event handlers without stale values
  const messagesRef = useRef([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  // Mark this conversation as read on the server and update the badges
  const markAsRead = () =>
    api
      .put(`/chats/${conversation._id}/read`)
      .then(() => {
        onRead(conversation._id);
        announceRead();
      })
      .catch((err) => console.error("Failed to mark as read:", err));

  // ---- Typing events (sent to the other person) ----
  const emitTyping = (isTypingNow) => {
    const socket = getSocket();
    if (socket?.connected) {
      socket.emit("typing", {
        conversationId: conversation._id,
        isTyping: isTypingNow,
      });
    }
  };

  const stopTyping = () => {
    const t = typingRef.current;
    clearTimeout(t.timer);
    if (t.active) {
      t.active = false;
      emitTyping(false);
    }
  };

  const handleChange = (e) => {
    const value = e.target.value;
    setText(value);

    const t = typingRef.current;
    if (!value.trim()) {
      stopTyping();
      return;
    }

    const now = Date.now();
    // tell the server when we start, and repeat every 3 seconds while typing
    if (!t.active || now - t.lastEmit > 3000) {
      t.active = true;
      t.lastEmit = now;
      emitTyping(true);
    }

    clearTimeout(t.timer);
    t.timer = setTimeout(stopTyping, 2000); // 2 seconds without typing = stopped
  };

  // leaving the conversation = stop typing
  useEffect(() => {
    return () => stopTyping();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load the latest messages, then mark them as read
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await api.get(`/chats/${conversation._id}/messages`, {
          params: { limit: PAGE_SIZE },
        });
        if (cancelled) return;
        setMessages(data.messages);
        setHasMore(data.hasMore);

        if (conversation.unreadCount > 0) {
          if (isViewing()) {
            await markAsRead();
          } else {
            unseenRef.current = true;
          }
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
        if (!cancelled) setError("Could not load messages");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation._id]);

  // Live: new messages, connection status, catching up after a reconnect
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    setConnected(socket.connected);

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onNewMessage = (message) => {
      if (message.conversation !== conversation._id) return;

      const mine = message.sender._id === currentUserId;
      const el = scrollRef.current;
      const nearBottom = el
        ? el.scrollHeight - el.scrollTop - el.clientHeight < 150
        : true;

      // follow the conversation, unless the user scrolled up to read old messages
      if (mine || nearBottom) pendingScroll.current = "bottom";

      setMessages((prev) =>
        prev.some((m) => m._id === message._id) ? prev : [...prev, message]
      );

      if (!mine) {
        // only count it as read if the user can actually see it
        if (isViewing()) markAsRead();
        else unseenRef.current = true;
      }
    };

    // After a dropped connection: fetch the newest messages and merge them in
    const syncMissed = async () => {
      try {
        const { data } = await api.get(`/chats/${conversation._id}/messages`, {
          params: { limit: PAGE_SIZE },
        });
        const known = messagesRef.current;
        const fresh = data.messages;

        const el = scrollRef.current;
        const nearBottom = el
          ? el.scrollHeight - el.scrollTop - el.clientHeight < 150
          : true;
        if (nearBottom) pendingScroll.current = "bottom";

        const lastKnown = known.length
          ? new Date(known[known.length - 1].createdAt)
          : null;
        const gap =
          lastKnown &&
          fresh.length > 0 &&
          data.hasMore &&
          new Date(fresh[0].createdAt) > lastKnown;

        if (!lastKnown || gap) {
          // we missed so much that the new page does not touch what we have
          setMessages(fresh);
          setHasMore(data.hasMore);
        } else {
          const merged = new Map(known.map((m) => [m._id, m]));
          fresh.forEach((m) => merged.set(m._id, m));
          setMessages(
            [...merged.values()].sort(
              (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
            )
          );
        }

        if (fresh.some((m) => m.sender._id !== currentUserId && !m.readAt)) {
          if (isViewing()) markAsRead();
          else unseenRef.current = true;
        }
      } catch (err) {
        console.error("Failed to catch up after reconnecting:", err);
      }
    };

    // The user came back to this tab: now the unseen messages count as read
    const onBackToTab = () => {
      if (unseenRef.current && isViewing()) {
        unseenRef.current = false;
        markAsRead();
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("message:new", onNewMessage);
    socket.io.on("reconnect", syncMissed);
    window.addEventListener("focus", onBackToTab);
    document.addEventListener("visibilitychange", onBackToTab);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("message:new", onNewMessage);
      socket.io.off("reconnect", syncMissed);
      window.removeEventListener("focus", onBackToTab);
      document.removeEventListener("visibilitychange", onBackToTab);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation._id, currentUserId]);

  // Apply the scroll decision right after messages are drawn
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el || messages.length === 0) return;

    const action = pendingScroll.current;
    if (action === "bottom") {
      el.scrollTop = el.scrollHeight;
    } else if (action && action.restoreFrom !== undefined) {
      el.scrollTop = el.scrollHeight - action.restoreFrom;
    }
    pendingScroll.current = null;
  }, [messages]);

  // Focus the input when a conversation opens
  useEffect(() => {
    inputRef.current?.focus();
  }, [conversation._id]);

  const loadOlder = async () => {
    if (messages.length === 0) return;
    setLoadingOlder(true);
    try {
      const { data } = await api.get(`/chats/${conversation._id}/messages`, {
        params: { limit: PAGE_SIZE, before: messages[0].createdAt },
      });
      pendingScroll.current = { restoreFrom: scrollRef.current.scrollHeight };
      setMessages((prev) => [...data.messages, ...prev]);
      setHasMore(data.hasMore);
    } catch (err) {
      console.error("Failed to load older messages:", err);
      setError("Could not load older messages");
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleSend = (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || sending) return;

    const socket = getSocket();
    if (!socket || !socket.connected) {
      setSendError("Not connected. Please wait while we reconnect.");
      return;
    }

    stopTyping();
    setSending(true);
    setSendError("");

    // The server answers with an "ack": { ok: true } or { ok: false, error }
    socket
      .timeout(8000)
      .emit(
        "message:send",
        { conversationId: conversation._id, text: clean },
        (err, reply) => {
          setSending(false);
          if (err) {
            setSendError("The server did not respond. Please try again.");
            return;
          }
          if (!reply?.ok) {
            setSendError(reply?.error || "Could not send the message");
            return;
          }
          setText(""); // the message itself appears through "message:new"
          inputRef.current?.focus();
        }
      );
  };

  const other = conversation.other;
  const otherInactive = other && other.isActive === false;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
        <div className="relative shrink-0">
          <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold">
            {initials(other?.name)}
          </div>
          {isOnline && (
            <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-green-500 border-2 border-white" />
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 truncate">
            {other?.name || "Unknown user"}
          </p>
          <p className="text-xs text-gray-500 truncate">
            <span className={isOnline ? "text-green-600 font-medium" : ""}>
              {isOnline ? "Online" : "Offline"}
            </span>{" "}
            · {other?.role} · {other?.email}
          </p>
        </div>
      </div>

      {!connected && (
        <p className="bg-red-50 text-red-700 text-sm px-5 py-2">
          Connection lost. Reconnecting...
        </p>
      )}

      {otherInactive && (
        <p className="bg-yellow-50 text-yellow-800 text-sm px-5 py-2">
          This user is no longer active, so you can't send them new messages.
        </p>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 bg-white">
        {loading ? (
          <p className="text-sm text-gray-500">Loading messages...</p>
        ) : error ? (
          <p className="text-sm text-red-600">{error}</p>
        ) : messages.length === 0 ? (
          <p className="text-sm text-gray-500 text-center mt-8">
            No messages yet. Say hello!
          </p>
        ) : (
          <>
            {hasMore && (
              <div className="text-center mb-4">
                <button
                  onClick={loadOlder}
                  disabled={loadingOlder}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:opacity-60"
                >
                  {loadingOlder ? "Loading..." : "Load older messages"}
                </button>
              </div>
            )}

            {messages.map((message, index) => {
              const mine = message.sender._id === currentUserId;
              const showDay =
                index === 0 ||
                !isSameDay(messages[index - 1].createdAt, message.createdAt);

              return (
                <div key={message._id}>
                  {showDay && (
                    <div className="text-center my-4">
                      <span className="text-xs text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
                        {dayLabel(message.createdAt)}
                      </span>
                    </div>
                  )}
                  <div
                    className={`flex mb-2 ${mine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-[70%] px-4 py-2 rounded-2xl ${
                        mine
                          ? "bg-blue-600 text-white rounded-br-sm"
                          : "bg-gray-100 text-gray-800 rounded-bl-sm"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">
                        {message.text}
                      </p>
                      <p
                        className={`text-[11px] mt-1 text-right ${
                          mine ? "text-blue-100" : "text-gray-400"
                        }`}
                      >
                        {formatTime(message.createdAt)}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      {/* Typing indicator */}
      <div className="px-5 h-5 text-xs text-gray-500 italic">
        {isTyping && `${other?.name || "Someone"} is typing...`}
      </div>

      {/* Input */}
      <form onSubmit={handleSend} className="border-t border-gray-200 p-4">
        {sendError && <p className="text-red-600 text-sm mb-2">{sendError}</p>}
        <div className="flex gap-3">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={handleChange}
            disabled={otherInactive}
            maxLength={2000}
            placeholder={
              otherInactive ? "You can't message this user" : "Type a message..."
            }
            className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
          />
          <button
            type="submit"
            disabled={!text.trim() || sending || otherInactive}
            className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send"}
          </button>
        </div>
      </form>
    </div>
  );
}

export default MessageWindow;