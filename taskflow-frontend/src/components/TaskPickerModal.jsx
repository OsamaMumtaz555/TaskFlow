import { useState, useEffect } from "react";
import api from "../api/api";
import { statusColor, priorityColor } from "../utils/taskHelpers";

function TaskPickerModal({ onClose, onPick }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const { data } = await api.get("/tasks"); // only tasks I can see
        setTasks(data);
      } catch (err) {
        console.error("Failed to load tasks:", err);
        setError("Could not load your tasks");
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, []);

  const q = search.toLowerCase();
  const list = tasks
    .filter((t) => t.title.toLowerCase().includes(q))
    // open tasks first
    .sort((a, b) => (a.status === "Completed") - (b.status === "Completed"));

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-gray-800 mb-1">Share a task</h3>
        <p className="text-sm text-gray-500 mb-4">
          The other person can view the task you pick, but not edit it.
        </p>

        <input
          type="text"
          placeholder="Search your tasks..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-gray-500">No tasks found.</p>
          ) : (
            list.map((task) => (
              <button
                key={task._id}
                onClick={() => onPick(task)}
                className="w-full text-left px-2 py-2 rounded-md hover:bg-gray-50 flex items-center justify-between gap-3"
              >
                <span className="text-gray-800 truncate">{task.title}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {task.priority && (
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${priorityColor[task.priority]}`}
                    >
                      {task.priority}
                    </span>
                  )}
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor[task.status]}`}
                  >
                    {task.status}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>

        <div className="flex justify-end mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default TaskPickerModal;