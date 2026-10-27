import { useState, useEffect } from "react";
import api from "../api/api";
import Layout from "../components/Layout";
import ConversationList from "../components/ConversationList";
import MessageWindow from "../components/MessageWindow";
import NewChatModal from "../components/NewChatModal";
import { getCurrentUser } from "../utils/taskHelpers";

function ChatPage() {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeId, setActiveId] = useState(null);
  const [showNewChat, setShowNewChat] = useState(false);

  const currentUser = getCurrentUser();

  useEffect(() => {
    const fetchChats = async () => {
      try {
        const { data } = await api.get("/chats");
        setConversations(data);
      } catch (err) {
        console.error("Failed to load chats:", err);
        setError("Could not load your chats");
      } finally {
        setLoading(false);
      }
    };
    fetchChats();
  }, []);

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
              currentUserId={currentUser?._id}
              loading={loading}
              onSelect={setActiveId}
              onNewChat={() => setShowNewChat(true)}
            />
          )}
        </div>

        <div className="flex-1 min-w-0">
          {activeConversation ? (
            <MessageWindow
              key={activeConversation._id}
              conversation={activeConversation}
              currentUserId={currentUser?._id}
              onRead={handleRead}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-500">
              Select a conversation or start a new chat.
            </div>
          )}
        </div>
      </div>

      {showNewChat && (
        <NewChatModal
          currentUserId={currentUser?._id}
          onClose={() => setShowNewChat(false)}
          onPick={handleStartChat}
        />
      )}
    </Layout>
  );
}

export default ChatPage;