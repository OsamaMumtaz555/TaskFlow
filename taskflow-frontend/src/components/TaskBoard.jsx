import { useState, useEffect } from "react";
import api from "../api/api";
import TaskEditModal from "./TaskEditModal";
import {
  getId,
  getCurrentUser,
  statusColor,
  priorityColor,
  isOverdue,
} from "../utils/taskHelpers";

function TaskBoard() {
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [view, setView] = useState("mine");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("All");
  const [newTitle, setNewTitle] = useState("");
  const [newStatus, setNewStatus] = useState("Pending");
  const [newAssignee, setNewAssignee] = useState("");
  const [createError, setCreateError] = useState("");
  const [editingTask, setEditingTask] = useState(null);

  const user = getCurrentUser();

  // Same rules as the backend
  const isAdmin = user?.role === "Admin";
  const isCreator = (task) => getId(task.createdBy) === user?._id;
  const isAssignee = (task) => getId(task.assignedTo) === user?._id;
  const canEditAll = (task) => isAdmin || isCreator(task);
  const canEdit = (task) => canEditAll(task) || isAssignee(task);
  const canDelete = (task) => isAdmin || isCreator(task);

  const viewFilters = {
    mine: (t) => isCreator(t) || isAssignee(t),
    assigned: (t) => isAssignee(t),
    created: (t) => isCreator(t),
    all: () => true,
  };

  const tabs = [
    { key: "mine", label: "All mine" },
    { key: "assigned", label: "Assigned to me" },
    { key: "created", label: "Created by me" },
    ...(isAdmin ? [{ key: "all", label: "Everyone's tasks" }] : []),
  ];

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [tasksRes, usersRes] = await Promise.all([
          api.get("/tasks"),
          api.get("/users"),
        ]);
        setTasks(tasksRes.data);
        setUsers(usersRes.data);
      } catch (err) {
        console.error("Failed to fetch data:", err);
        setError("Could not load tasks");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
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
        assignedTo: newAssignee,
      });
      setTasks([response.data, ...tasks]);
      setNewTitle("");
      setNewStatus("Pending");
      setNewAssignee("");
    } catch (err) {
      console.error("Failed to create task:", err);
      setCreateError(err.response?.data?.message || "Could not create task");
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

  const viewTasks = tasks.filter(viewFilters[view]);

  const filteredTasks = viewTasks.filter((task) => {
    const matchesSearch = task.title
      .toLowerCase()
      .includes(searchTerm.toLowerCase());
    const matchesStatus =
      statusFilter === "All" || task.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  if (loading) {
    return <div className="p-8 flex-1">Loading tasks...</div>;
  }

  if (error) {
    return <div className="p-8 flex-1 text-red-600">{error}</div>;
  }

  return (
    <div className="p-8 flex-1">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">My Tasks</h2>

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
          value={newAssignee}
          onChange={(e) => setNewAssignee(e.target.value)}
          className="border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">Unassigned</option>
          {users.map((u) => (
            <option key={u._id} value={u._id}>
              {u.name}
            </option>
          ))}
        </select>
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

      {/* View tabs */}
      <div className="flex gap-2 mb-4 border-b border-gray-200">
        {tabs.map((tab) => {
          const count = tasks.filter(viewFilters[tab.key]).length;
          return (
            <button
              key={tab.key}
              onClick={() => setView(tab.key)}
              className={`px-4 py-2 text-sm font-medium -mb-px border-b-2 transition ${
                view === tab.key
                  ? "border-blue-600 text-blue-700"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tab.label} ({count})
            </button>
          );
        })}
      </div>

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
          <p className="text-gray-500">
            {viewTasks.length === 0
              ? "No tasks here yet."
              : "No tasks match your search."}
          </p>
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
                <div className="flex flex-wrap gap-x-4 mt-1 text-xs text-gray-400">
                  {task.assignedTo && (
                    <span>
                      Assigned to{" "}
                      {isAssignee(task) ? "you" : task.assignedTo.name}
                    </span>
                  )}
                  {isAssignee(task) && !isCreator(task) && task.createdBy && (
                    <span>From {task.createdBy.name}</span>
                  )}
                  {task.dueDate && (
                    <span
                      className={
                        isOverdue(task) ? "text-red-600 font-medium" : ""
                      }
                    >
                      Due {new Date(task.dueDate).toLocaleDateString()}
                      {isOverdue(task) && " (overdue)"}
                    </span>
                  )}
                </div>
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
          users={users}
          canEditAll={canEditAll(editingTask)}
          onClose={() => setEditingTask(null)}
          onSaved={handleTaskSaved}
        />
      )}
    </div>
  );
}

export default TaskBoard; 