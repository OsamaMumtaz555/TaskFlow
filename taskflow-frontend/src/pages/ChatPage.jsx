import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import api from "../api/api";
import { getSocket } from "../socket";
import usePresence from "../hooks/usePresence";
import Layout from "../components/Layout";
import ConversationList from "../components/ConversationList";
import MessageWindow from "../components/MessageWindow";
import NewChatModal from "../components/NewChatModal";
import { getCurrentUser } from "../utils/taskHelpers";

function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);
  const [typingIds, setTypingIds] = useState({}); // conversationId -> true
  const [searchParams, setSearchParams] = useSearchParams();

  const onlineIds = usePresence();
  const currentUser = getCurrentUser();
  const myId = currentUser?._id;

  // The socket handler needs the latest list without re-subscribing on every change
  const conversationsRef = useRef([]);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const typingTimers = useRef({});

  const fetchChats = async () => {
    const { data } = await api.get("/chats");
    setConversations(data);
  };

  useEffect(() => {
    const load = async () => {
      try {
        await fetchChats();
      } catch (err) {
        console.error("Failed to load chats:", err);
        setError("Could not load your chats");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const clearTyping = (conversationId) => {
    clearTimeout(typingTimers.current[conversationId]);
    setTypingIds((prev) => {
      if (!prev[conversationId]) return prev;
      const next = { ...prev };
      delete next[conversationId];
      return next;
    });
  };

  // Typing indicators from the other person
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const timers = typingTimers.current;

    const onTyping = ({ conversationId, isTyping }) => {
      if (!isTyping) {
        clearTyping(conversationId);
        return;
      }
      setTypingIds((prev) => ({ ...prev, [conversationId]: true }));
      // safety net: if the "stopped typing" event never arrives, hide it after 5s
      clearTimeout(timers[conversationId]);
      timers[conversationId] = setTimeout(() => clearTyping(conversationId), 5000);
    };

    socket.on("typing", onTyping);
    return () => {
      socket.off("typing", onTyping);
      Object.values(timers).forEach(clearTimeout);
    };
  }, []);

  // Live updates for the conversation list
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const refetch = () =>
      fetchChats().catch((err) => console.error("Failed to refresh chats:", err));

    const onNewMessage = (message) => {
      const fromMe = message.sender._id === myId;
      const isOpen = message.conversation === activeId;

      if (!fromMe) clearTyping(message.conversation); // they sent it, so they stopped typing

      // A teammate started a brand-new conversation with me: load the list again
      if (!conversationsRef.current.some((c) => c._id === message.conversation)) {
        refetch();
        return;
      }

      setConversations((prev) =>
        prev
          .map((c) =>
            c._id === message.conversation
              ? {
                  ...c,
                  lastMessage: {
                    text: message.text.slice(0, 100),
                    sender: message.sender._id,
                    sentAt: message.createdAt,
                  },
                  lastMessageAt: message.createdAt,
                  // not mine and not the one I'm looking at: count it as unread
                  unreadCount:
                    fromMe || isOpen ? c.unreadCount : c.unreadCount + 1,
                }
              : c
          )
          .sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt))
      );
    };

    socket.on("message:new", onNewMessage);
    socket.io.on("reconnect", refetch); // catch up on anything missed while offline

    return () => {
      socket.off("message:new", onNewMessage);
      socket.io.off("reconnect", refetch);
    };
  }, [activeId, myId]);

  const activeConversation =
    conversations.find((c) => c._id === activeId) || null;

  // Open (or create) the conversation with a teammate, then select it
  const handleStartChat = async (userId) => {
    const { data } = await api.post("/chats", { userId });
    setConversations((prev) =>
      prev.some((c) => c._id === data._id) ? prev : [data, ...prev]
    );
    setActiveId(data._id);
    setShowNewChat(false);
  };

  // Arrived from the Team page via /chat?user=<id>
  const startWith = searchParams.get("user");
  useEffect(() => {
    if (!startWith || loading) return; // wait until the list has loaded

    const start = async () => {
      try {
        await handleStartChat(startWith);
      } catch (err) {
        console.error("Failed to start chat:", err);
        setNotice(err.response?.data?.message || "Could not start the chat");
      } finally {
        setSearchParams({}, { replace: true }); // clean the URL
      }
    };
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWith, loading]);

  // Called by the message window once messages were marked as read
  const handleRead = (conversationId) => {
    setConversations((prev) =>
      prev.map((c) => (c._id === conversationId ? { ...c, unreadCount: 0 } : c))
    );
  };

  return (
    <Layout>
      <div
        className="flex-1 flex bg-white min-w-0"
        style={{ height: "calc(100vh - 60px)" }}
      >
        <div className="w-80 border-r border-gray-200 shrink-0">
          {error ? (
            <p className="p-4 text-sm text-red-600">{error}</p>
          ) : (
            <ConversationList
              conversations={conversations}
              activeId={activeId}
              currentUserId={myId}
              loading={loading}
              onlineIds={onlineIds}
              typingIds={typingIds}
              onSelect={(id) => {
                setNotice("");
                setActiveId(id);
              }}
              onNewChat={() => setShowNewChat(true)}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {activeConversation ? (
            <MessageWindow
              key={activeConversation._id}
              conversation={activeConversation}
              currentUserId={myId}
              isOnline={onlineIds.has(activeConversation.other?._id)}
              isTyping={Boolean(typingIds[activeConversation._id])}
              onRead={handleRead}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-500 gap-2">
              {notice && <p className="text-red-600 text-sm">{notice}</p>}
              <p>Select a conversation or start a new chat.</p>
            </div>
          )}
        </div>
      </div>

      {showNewChat && (
        <NewChatModal
          currentUserId={myId}
          onClose={() => setShowNewChat(false)}
          onPick={handleStartChat}
        />
      )}
    </Layout>
  );
}

export default ChatPage;