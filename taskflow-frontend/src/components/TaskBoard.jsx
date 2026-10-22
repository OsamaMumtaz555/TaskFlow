import { useState, useEffect } from "react";
import api from "../api/api";
import TaskEditModal from "./TaskEditModal";

// createdBy / assignedTo can be a populated object or a plain id string
const getId = (value) =>
  value && typeof value === "object" ? value._id : value;

function TaskBoard() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [newTitle, setNewTitle] = useState("");
  const [newStatus, setNewStatus] = useState("Pending");
  const [createError, setCreateError] = useState("");
  const [editingTask, setEditingTask] = useState(null);

  const user = JSON.parse(localStorage.getItem("user"));

  const statusColor = {
    Completed: "bg-green-100 text-green-700",
    "In Progress": "bg-yellow-100 text-yellow-700",
    Pending: "bg-gray-200 text-gray-700",
  };

  const priorityColor = {
    High: "bg-red-100 text-red-700",
    Medium: "bg-blue-100 text-blue-700",
    Low: "bg-gray-100 text-gray-600",
  };

  // Same rules as the backend
  const isAdmin = user?.role === "Admin";
  const isCreator = (task) => getId(task.createdBy) === user?._id;
  const isAssignee = (task) => getId(task.assignedTo) === user?._id;
  const canEditAll = (task) => isAdmin || isCreator(task);
  const canEdit = (task) => canEditAll(task) || isAssignee(task);
  const canDelete = (task) => isAdmin || isCreator(task);

  const isOverdue = (task) =>
    task.dueDate &&
    task.status !== "Completed" &&
    new Date(task.dueDate) < new Date();

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const response = await api.get("/tasks");
        setTasks(response.data);
      } catch (err) {
        console.error("Failed to fetch tasks:", err);
        setError("Could not load tasks");
      } finally {
        setLoading(false);
      }
    };

    fetchTasks();
  }, []);

  const handleCreateTask = async (e) => {
    e.preventDefault();
    setCreateError("");

    if (!newTitle.trim()) {
      setCreateError("Task title cannot be empty");
      return;
    }

    try {
      const response = await api.post("/tasks", {
        title: newTitle,
        status: newStatus,
      });
      setTasks([response.data, ...tasks]);
      setNewTitle("");
      setNewStatus("Pending");
    } catch (err) {
      console.error("Failed to create task:", err);
      setCreateError("Could not create task");
    }
  };

  const handleDelete = async (taskId) => {
    if (!window.confirm("Delete this task?")) return;
    try {
      await api.delete(`/tasks/${taskId}`);
      setTasks(tasks.filter((t) => t._id !== taskId));
    } catch (err) {
      console.error("Failed to delete task:", err);
    }
  };

  const handleTaskSaved = (updatedTask) => {
    setTasks(tasks.map((t) => (t._id === updatedTask._id ? updatedTask : t)));
    setEditingTask(null);
  };

  const filteredTasks = tasks.filter((task) => {
    const matchesSearch = task.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const taskCounts = {
    Total: tasks.length,
    Pending: tasks.filter((t) => t.status === "Pending").length,
    "In Progress": tasks.filter((t) => t.status === "In Progress").length,
    Completed: tasks.filter((t) => t.status === "Completed").length,
  };

  if (loading) {
    return <div className="p-8 flex-1">Loading tasks...</div>;
  }

  if (error) {
    return <div className="p-8 flex-1 text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 flex-1">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">My Tasks</h2>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-800">{taskCounts.Total}</p>
          <p className="text-sm text-gray-500">Total</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm text-center">
          <p className="text-2xl font-bold text-gray-700">{taskCounts.Pending}</p>
          <p className="text-sm text-gray-500">Pending</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm text-center">
          <p className="text-2xl font-bold text-yellow-600">
            {taskCounts["In Progress"]}
          </p>
          <p className="text-sm text-gray-500">In Progress</p>
        </div>
        <div className="bg-white p-4 rounded-lg shadow-sm text-center">
          <p className="text-2xl font-bold text-green-600">
            {taskCounts.Completed}
          </p>
          <p className="text-sm text-gray-500">Completed</p>
        </div>
      </div>

      <form
        onSubmit={handleCreateTask}
        className="bg-white p-4 rounded-lg shadow-sm flex gap-3 mb-6"
      >
        <input
          type="text"
          placeholder="New task title..."
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
        </select>
        <button
          type="submit"
          className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition"
        >
          Add Task
        </button>
      </form>
      {createError && (
        <p className="text-red-600 text-sm -mt-4 mb-4">{createError}</p>
      )}

      <div className="flex gap-3 mb-6">
        <input
          type="text"
          placeholder="Search tasks..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="All">All</option>
          <option value="Pending">Pending</option>
          <option value="In Progress">In Progress</option>
          <option value="Completed">Completed</option>
        </select>
      </div>

      <div className="flex flex-col gap-3">
        {filteredTasks.length === 0 ? (
          <p className="text-gray-500">No tasks match your search.</p>
        ) : (
          filteredTasks.map((task) => (
            <div
              key={task._id}
              className="bg-white p-4 rounded-lg shadow-sm flex justify-between items-center gap-4"
            >
              <div className="min-w-0">
                <p className="text-gray-800 font-medium">{task.title}</p>
                {task.description && (
                  <p className="text-sm text-gray-500 truncate">
                    {task.description}
                  </p>
                )}
                {task.dueDate && (
                  <p
                    className={`text-xs mt-1 ${
                      isOverdue(task) ? "text-red-600 font-medium" : "text-gray-400"
                    }`}
                  >
                    Due {new Date(task.dueDate).toLocaleDateString()}
                    {isOverdue(task) && " (overdue)"}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-3 shrink-0">
                {task.priority && (
                  <span
                    className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColor[task.priority]}`}
                  >
                    {task.priority}
                  </span>
                )}
                <span
                  className={`text-sm px-3 py-1 rounded-full font-medium ${statusColor[task.status]}`}
                >
                  {task.status}
                </span>
                {canEdit(task) && (
                  <button
                    onClick={() => setEditingTask(task)}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Edit
                  </button>
                )}
                {canDelete(task) && (
                  <button
                    onClick={() => handleDelete(task._id)}
                    className="text-red-600 hover:text-red-800 text-sm font-medium"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {editingTask && (
        <TaskEditModal
          task={editingTask}
          canEditAll={canEditAll(editingTask)}
          onClose={() => setEditingTask(null)}
          onSaved={handleTaskSaved}
        />
      )}
    </div>
  );
}

export default TaskBoard;