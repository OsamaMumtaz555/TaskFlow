import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import api from "../api/api";
import Layout from "../components/Layout";
import {
  getCurrentUser,
  statusColor,
  priorityColor,
  isOverdue,
} from "../utils/taskHelpers";

function DashboardPage() {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const user = getCurrentUser();
  const isAdmin = user?.role === "Admin";

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        // Admin gets every task, Member gets only their own (decided by the backend)
        const response = await api.get("/tasks");
        setTasks(response.data);
      } catch (err) {
        console.error("Failed to fetch tasks:", err);
        setError("Could not load the dashboard");
      } finally {
        setLoading(false);
      }
    };
    fetchTasks();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="p-8 flex-1">Loading dashboard...</div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="p-8 flex-1 text-red-600">{error}</div>
      </Layout>
    );
  }

  const openTasks = tasks.filter((t) => t.status !== "Completed");
  const overdueTasks = tasks
    .filter(isOverdue)
    .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  const recentTasks = tasks.slice(0, 5); // backend returns newest first

  const counts = {
    Total: tasks.length,
    Pending: tasks.filter((t) => t.status === "Pending").length,
    "In Progress": tasks.filter((t) => t.status === "In Progress").length,
    Completed: tasks.filter((t) => t.status === "Completed").length,
    Overdue: overdueTasks.length,
  };

  const completionRate = counts.Total
    ? Math.round((counts.Completed / counts.Total) * 100)
    : 0;

  const priorityCounts = {
    High: openTasks.filter((t) => t.priority === "High").length,
    Medium: openTasks.filter((t) => t.priority === "Medium").length,
    Low: openTasks.filter((t) => t.priority === "Low").length,
  };

  const barColor = {
    High: "bg-red-400",
    Medium: "bg-blue-400",
    Low: "bg-gray-400",
  };

  // Admin only: open tasks per assignee
  const workload = {};
  openTasks.forEach((t) => {
    const name = t.assignedTo?.name || "Unassigned";
    workload[name] = (workload[name] || 0) + 1;
  });
  const workloadList = Object.entries(workload).sort((a, b) => b[1] - a[1]);

  const statCards = [
    { label: "Total", value: counts.Total, color: "text-gray-800" },
    { label: "Pending", value: counts.Pending, color: "text-gray-700" },
    { label: "In Progress", value: counts["In Progress"], color: "text-yellow-600" },
    { label: "Completed", value: counts.Completed, color: "text-green-600" },
    { label: "Overdue", value: counts.Overdue, color: "text-red-600" },
  ];

  return (
    <Layout>
      <div className="p-8 flex-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">
          {isAdmin ? "Team Overview" : "My Overview"}
        </h2>
        <p className="text-gray-500 mb-6">
          {isAdmin
            ? "All tasks across the team"
            : "Tasks you created or that are assigned to you"}
        </p>

        {/* Stat cards */}
        <div className="grid grid-cols-5 gap-4 mb-6">
          {statCards.map((card) => (
            <div
              key={card.label}
              className="bg-white p-4 rounded-lg shadow-sm text-center"
            >
              <p className={`text-2xl font-bold ${card.color}`}>{card.value}</p>
              <p className="text-sm text-gray-500">{card.label}</p>
            </div>
          ))}
        </div>

        {/* Completion progress */}
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
          <div className="flex justify-between text-sm text-gray-600 mb-2">
            <span>Completion</span>
            <span>{completionRate}%</span>
          </div>
          <div className="w-full bg-gray-100 rounded-full h-3">
            <div
              className="bg-green-500 h-3 rounded-full"
              style={{ width: `${completionRate}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Overdue */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-3">Needs attention</h3>
            {overdueTasks.length === 0 ? (
              <p className="text-sm text-gray-500">No overdue tasks. Nice!</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {overdueTasks.slice(0, 5).map((task) => (
                  <li
                    key={task._id}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="text-gray-800 truncate pr-3">{task.title}</span>
                    <span className="text-red-600 shrink-0">
                      Due {new Date(task.dueDate).toLocaleDateString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Priority breakdown */}
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <h3 className="font-semibold text-gray-800 mb-3">
              Open tasks by priority
            </h3>
            {openTasks.length === 0 ? (
              <p className="text-sm text-gray-500">No open tasks.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {["High", "Medium", "Low"].map((level) => (
                  <div key={level}>
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>{level}</span>
                      <span>{priorityCounts[level]}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className={`${barColor[level]} h-2 rounded-full`}
                        style={{
                          width: `${(priorityCounts[level] / openTasks.length) * 100}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Admin only: workload */}
        {isAdmin && (
          <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
            <h3 className="font-semibold text-gray-800 mb-3">
              Open tasks per team member
            </h3>
            {workloadList.length === 0 ? (
              <p className="text-sm text-gray-500">No open tasks.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {workloadList.map(([name, count]) => (
                  <li key={name} className="flex justify-between text-sm">
                    <span className="text-gray-800">{name}</span>
                    <span className="text-gray-500">
                      {count} open task{count > 1 ? "s" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Recent tasks */}
        <div className="bg-white p-4 rounded-lg shadow-sm">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold text-gray-800">Recent tasks</h3>
            <Link
              to="/tasks"
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
            >
              View all
            </Link>
          </div>
          {recentTasks.length === 0 ? (
            <p className="text-sm text-gray-500">No tasks yet.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {recentTasks.map((task) => (
                <li
                  key={task._id}
                  className="flex justify-between items-center gap-3"
                >
                  <span className="text-gray-800 truncate">{task.title}</span>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.priority && (
                      <span
                        className={`text-xs px-2 py-1 rounded-full font-medium ${priorityColor[task.priority]}`}
                      >
                        {task.priority}
                      </span>
                    )}
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${statusColor[task.status]}`}
                    >
                      {task.status}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default DashboardPage; 