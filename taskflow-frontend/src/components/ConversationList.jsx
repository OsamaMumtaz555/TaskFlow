import { initials, formatListTime } from "../utils/chatHelpers";

function ConversationList({
  conversations,
  activeId,
  currentUserId,
  loading,
  onSelect,
  onNewChat,
}) {
  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h3 className="text-lg font-bold text-gray-800">Chats</h3>
        <button
          onClick={onNewChat}
          className="text-sm bg-blue-600 text-white font-semibold px-3 py-1.5 rounded-md hover:bg-blue-700 transition"
        >
          + New chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <p className="p-4 text-sm text-gray-500">Loading chats...</p>
        ) : conversations.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">
            No conversations yet. Click "+ New chat" to message a teammate.
          </p>
        ) : (
          conversations.map((conv) => {
            const isActive = conv._id === activeId;
            const preview = conv.lastMessage
              ? `${conv.lastMessage.sender === currentUserId ? "You: " : ""}${conv.lastMessage.text}`
              : "No messages yet";

            return (
              <button
                key={conv._id}
                onClick={() => onSelect(conv._id)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 border-b border-gray-100 transition ${
                  isActive ? "bg-blue-50" : "hover:bg-gray-50"
                }`}
              >
                <div className="w-11 h-11 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold shrink-0">
                  {initials(conv.other?.name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-gray-800 truncate">
                      {conv.other?.name || "Unknown user"}
                    </p>
                    {conv.lastMessage && (
                      <span className="text-xs text-gray-400 shrink-0">
                        {formatListTime(conv.lastMessageAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <p
                      className={`text-sm truncate ${
                        conv.unreadCount > 0
                          ? "text-gray-800 font-medium"
                          : "text-gray-500"
                      }`}
                    >
                      {preview}
                    </p>
                    {conv.unreadCount > 0 && (
                      <span className="bg-blue-600 text-white text-xs font-semibold rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center shrink-0">
                        {conv.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export default ConversationList;