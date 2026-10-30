import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import { getSocket } from "../socket";
import {
  getCurrentUser,
  statusColor,
  priorityColor,
  isOverdue,
} from "../utils/taskHelpers";
import { describeActivity } from "../utils/activityHelpers";
import { timeAgo } from "../utils/notificationHelpers";

function Row({ label, children }) {
  return (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-gray-800">{children}</p>
    </div>
  );
}

function TaskDetailModal({ taskId, onClose, showOpenLink = true }) {
  const navigate = useNavigate();
  const me = getCurrentUser();

  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [activity, setActivity] = useState([]);
  const [text, setText] = useState("");
  const [posting, setPosting] = useState(false);
  const [activityError, setActivityError] = useState("");
  const listRef = useRef(null);

  // Load the task, then (only if I have real access) its comments and activity
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const { data } = await api.get(`/tasks/${taskId}`);
        if (cancelled) return;
        setTask(data);

        if (!data.readOnly) {
          try {
            const res = await api.get(`/tasks/${taskId}/activity`);
            if (!cancelled) setActivity(res.data);
          } catch (err) {
            console.error("Failed to load activity:", err);
            if (!cancelled) setActivityError("Could not load the activity");
          }
        }
      } catch (err) {
        console.error("Failed to load task:", err);
        if (!cancelled) {
          setError(
            err.response?.status === 403 || err.response?.status === 404
              ? "This task is no longer available to you."
              : "Could not load the task."
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // Live: new comments/events, deleted comments, changes to this task
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    const onActivity = (entry) => {
      if (entry.task !== taskId) return;
      setActivity((prev) =>
        prev.some((a) => a._id === entry._id) ? prev : [...prev, entry]
      );
    };
    const onActivityDeleted = ({ taskId: id, activityId }) => {
      if (id !== taskId) return;
      setActivity((prev) => prev.filter((a) => a._id !== activityId));
    };
    const onTaskUpdated = (summary) => {
      if (summary._id !== taskId) return;
      setTask((prev) => (prev ? { ...prev, ...summary } : prev));
    };
    const onTaskDeleted = ({ taskId: id }) => {
      if (id !== taskId) return;
      setTask(null);
      setError("This task was deleted.");
    };

    socket.on("activity:new", onActivity);
    socket.on("activity:deleted", onActivityDeleted);
    socket.on("task:updated", onTaskUpdated);
    socket.on("task:deleted", onTaskDeleted);

    return () => {
      socket.off("activity:new", onActivity);
      socket.off("activity:deleted", onActivityDeleted);
      socket.off("task:updated", onTaskUpdated);
      socket.off("task:deleted", onTaskDeleted);
    };
  }, [taskId]);

  // Keep the newest entry in view
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [activity.length]);

  const handlePost = async (e) => {
    e.preventDefault();
    const clean = text.trim();
    if (!clean || posting) return;

    setPosting(true);
    setActivityError("");
    try {
      const { data } = await api.post(`/tasks/${taskId}/comments`, { text: clean });
      setActivity((prev) =>
        prev.some((a) => a._id === data._id) ? prev : [...prev, data]
      );
      setText("");
    } catch (err) {
      console.error("Failed to post comment:", err);
      setActivityError(err.response?.data?.message || "Could not post the comment");
    } finally {
      setPosting(false);
    }
  };

  const handleDeleteComment = async (activityId) => {
    if (!window.confirm("Delete this comment?")) return;
    try {
      await api.delete(`/tasks/${taskId}/comments/${activityId}`);
      setActivity((prev) => prev.filter((a) => a._id !== activityId));
    } catch (err) {
      console.error("Failed to delete comment:", err);
      setActivityError(err.response?.data?.message || "Could not delete the comment");
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-y-auto p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {loading ? (
          <p className="text-gray-500">Loading task...</p>
        ) : error ? (
          <p className="text-red-600">{error}</p>
        ) : (
          <>
            <h3 className="text-xl font-bold text-gray-800 mb-3">{task.title}</h3>

            <div className="flex flex-wrap gap-2 mb-4">
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColor[task.priority]}`}
              >
                {task.priority}
              </span>
              <span
                className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[task.status]}`}
              >
                {task.status}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <Row label="Description">{task.description || "No description"}</Row>
              <Row label="Assigned to">
                {task.assignedTo ? task.assignedTo.name : "Unassigned"}
              </Row>
              <Row label="Created by">
                {task.createdBy ? task.createdBy.name : "Unknown"}
              </Row>
              <Row label="Due date">
                {task.dueDate ? (
                  <span className={isOverdue(task) ? "text-red-600 font-medium" : ""}>
                    {new Date(task.dueDate).toLocaleDateString()}
                    {isOverdue(task) && " (overdue)"}
                  </span>
                ) : (
                  "No due date"
                )}
              </Row>
            </div>

            {task.sourceMessage && (
              <p className="text-xs text-gray-400 mt-3">Created from a chat message</p>
            )}

            {task.readOnly ? (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-md px-3 py-2 mt-4">
                This task was shared with you in chat. You can view it, but not edit
                it, and its comments are private to the people working on it.
              </p>
            ) : (
              <>
                {showOpenLink && (
                  <button
                    onClick={() => {
                      onClose();
                      navigate("/tasks");
                    }}
                    className="mt-4 text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    Open in My Tasks
                  </button>
                )}

                {/* Comments and activity */}
                <div className="mt-5 pt-4 border-t border-gray-200">
                  <h4 className="font-semibold text-gray-800 mb-3">
                    Comments &amp; activity
                  </h4>

                  <div
                    ref={listRef}
                    className="max-h-56 overflow-y-auto flex flex-col gap-2 mb-3"
                  >
                    {activity.length === 0 ? (
                      <p className="text-sm text-gray-500">No activity yet.</p>
                    ) : (
                      activity.map((entry) =>
                        entry.kind === "comment" ? (
                          <div key={entry._id} className="bg-gray-50 rounded-md px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="text-xs">
                                <span className="font-semibold text-gray-700">
                                  {entry.actor?.name}
                                </span>
                                <span className="text-gray-400">
                                  {" "}
                                  · {timeAgo(entry.createdAt)}
                                </span>
                              </p>
                              {(entry.actor?._id === me?._id || me?.role === "Admin") && (
                                <button
                                  onClick={() => handleDeleteComment(entry._id)}
                                  className="text-xs text-red-500 hover:text-red-700"
                                >
                                  Delete
                                </button>
                              )}
                            </div>
                            <p className="text-sm text-gray-800 whitespace-pre-wrap break-words">
                              {entry.text}
                            </p>
                          </div>
                        ) : (
                          <p key={entry._id} className="text-xs text-gray-500 px-1">
                            {describeActivity(entry)}
                            <span className="text-gray-400">
                              {" "}
                              · {timeAgo(entry.createdAt)}
                            </span>
                          </p>
                        )
                      )
                    )}
                  </div>

                  {activityError && (
                    <p className="text-red-600 text-sm mb-2">{activityError}</p>
                  )}

                  <form onSubmit={handlePost} className="flex gap-2">
                    <input
                      type="text"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      maxLength={1000}
                      placeholder="Write a comment..."
                      className="flex-1 border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <button
                      type="submit"
                      disabled={!text.trim() || posting}
                      className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-50"
                    >
                      {posting ? "Posting..." : "Post"}
                    </button>
                  </form>
                </div>
              </>
            )}
          </>
        )}

        <div className="flex justify-end mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskDetailModal;