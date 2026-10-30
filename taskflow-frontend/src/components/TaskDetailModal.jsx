import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/api";
import { statusColor, priorityColor, isOverdue } from "../utils/taskHelpers";

function TaskDetailModal({ taskId, onClose }) {
  const navigate = useNavigate();
  const [task, setTask] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchTask = async () => {
      try {
        const { data } = await api.get(`/tasks/${taskId}`);
        setTask(data);
      } catch (err) {
        console.error("Failed to load task:", err);
        setError(
          err.response?.status === 403 || err.response?.status === 404
            ? "This task is no longer available to you."
            : "Could not load the task."
        );
      } finally {
        setLoading(false);
      }
    };
    fetchTask();
  }, [taskId]);

  const Row = ({ label, children }) => (
    <div>
      <p className="text-xs text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-gray-800">{children}</p>
    </div>
  );

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-6"
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
              <Row label="Description">
                {task.description || "No description"}
              </Row>
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
              <p className="text-xs text-gray-400 mt-3">
                Created from a chat message
              </p>
            )}

            {task.readOnly ? (
              <p className="text-sm text-gray-500 bg-gray-50 rounded-md px-3 py-2 mt-4">
                This task was shared with you in chat. You can view it, but not edit it.
              </p>
            ) : (
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