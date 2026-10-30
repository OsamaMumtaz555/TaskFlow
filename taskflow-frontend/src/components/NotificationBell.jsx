import { useState, useEffect, useRef } from "react";
import useNotifications from "../hooks/useNotifications";
import TaskDetailModal from "./TaskDetailModal";
import {
  describeNotification,
  opensTask,
  timeAgo,
} from "../utils/notificationHelpers";

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [openTaskId, setOpenTaskId] = useState(null);
  const containerRef = useRef(null);

  const {
    notifications,
    unreadCount,
    hasMore,
    loading,
    markRead,
    markAllRead,
    loadMore,
  } = useNotifications((notification) => setToast(notification));

  // Close the dropdown with a click outside or the Escape key
  useEffect(() => {
    if (!open) return;

    const onClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };

    document.addEventListener("mousedown", onClickOutside);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The toast hides itself after 5 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Clicking a notification (or the toast): mark it read, and open the task if it still exists
  const handleClick = (notification) => {
    markRead(notification._id);
    setToast(null);
    if (opensTask(notification)) {
      setOpenTaskId(notification.task);
      setOpen(false);
    }
  };

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          onClick={() => setOpen((value) => !value)}
          aria-label="Notifications"
          className="relative p-2 rounded-full hover:bg-blue-500 transition"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
          >
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-4 h-4 px-1 flex items-center justify-center">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-96 bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 z-40 flex flex-col max-h-[70vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
              <h3 className="font-semibold">Notifications</h3>
              <button
                onClick={markAllRead}
                disabled={unreadCount === 0}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium disabled:text-gray-400 disabled:cursor-default"
              >
                Mark all as read
              </button>
            </div>

            <div className="overflow-y-auto">
              {loading ? (
                <p className="p-4 text-sm text-gray-500">Loading...</p>
              ) : notifications.length === 0 ? (
                <p className="p-4 text-sm text-gray-500">
                  No notifications yet. You'll see task assignments and status
                  changes here.
                </p>
              ) : (
                notifications.map((notification) => {
                  const unread = !notification.readAt;
                  return (
                    <button
                      key={notification._id}
                      onClick={() => handleClick(notification)}
                      className={`w-full text-left px-4 py-3 border-b border-gray-100 flex gap-3 hover:bg-gray-50 transition ${
                        unread ? "bg-blue-50" : ""
                      }`}
                    >
                      <span
                        className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                          unread ? "bg-blue-600" : "bg-transparent"
                        }`}
                      />
                      <span className="min-w-0">
                        <span
                          className={`block text-sm ${
                            unread ? "font-medium text-gray-900" : "text-gray-600"
                          }`}
                        >
                          {describeNotification(notification)}
                        </span>
                        <span className="block text-xs text-gray-400 mt-0.5">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}

              {hasMore && (
                <button
                  onClick={loadMore}
                  className="w-full py-3 text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Load more
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live toast for a notification that just arrived */}
      {toast && (
        <button
          onClick={() => handleClick(toast)}
          className="fixed bottom-6 right-6 z-50 max-w-sm text-left bg-white text-gray-800 rounded-lg shadow-lg border border-gray-200 px-4 py-3 hover:shadow-xl transition"
        >
          <span className="block text-xs text-blue-600 font-semibold mb-0.5">
            New notification
          </span>
          <span className="block text-sm">{describeNotification(toast)}</span>
        </button>
      )}

      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
        />
      )}
    </>
  );
}

export default NotificationBell;