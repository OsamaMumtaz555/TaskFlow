import { useState, useEffect, useRef, useLayoutEffect } from "react";
import api from "../api/api";
import {
  initials,
  formatTime,
  isSameDay,
  dayLabel,
} from "../utils/chatHelpers";

const PAGE_SIZE = 30;

function MessageWindow({ conversation, currentUserId, onRead }) {
  const [messages, setMessages] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState("");

  const scrollRef = useRef(null);
  // What to do with the scrollbar after the next render:
  // "bottom" (show newest) or { restoreFrom } (keep position after loading older)
  const pendingScroll = useRef("bottom");

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
          try {
            await api.put(`/chats/${conversation._id}/read`);
            if (!cancelled) onRead(conversation._id);
          } catch (err) {
            console.error("Failed to mark as read:", err);
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

  const other = conversation.other;
  const otherInactive = other && other.isActive === false;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-5 py-3 border-b border-gray-200 flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold shrink-0">
          {initials(other?.name)}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-gray-800 truncate">
            {other?.name || "Unknown user"}
          </p>
          <p className="text-xs text-gray-500 truncate">
            {other?.role} · {other?.email}
          </p>
        </div>
      </div>

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
            No messages yet. Messages you exchange will appear here.
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

      {/* Input (live sending arrives on Day 3) */}
      <div className="border-t border-gray-200 p-4 flex gap-3">
        <input
          type="text"
          disabled
          placeholder="Sending messages is coming next..."
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 bg-gray-100 text-gray-500"
        />
        <button
          disabled
          className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-md opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}

export default MessageWindow; 