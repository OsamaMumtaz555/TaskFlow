import { useState, useEffect } from "react";
import api from "../api/api";
import Layout from "../components/Layout";
import { getId, getCurrentUser, isOverdue } from "../utils/taskHelpers";

const initials = (name) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const roleColor = {
  Admin: "bg-purple-100 text-purple-700",
  Member: "bg-blue-100 text-blue-700",
};

function TeamPage() {
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");

  const currentUser = getCurrentUser();
  const isAdmin = currentUser?.role === "Admin";

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [usersRes, tasksRes] = await Promise.all([
          api.get("/users"),
          api.get("/tasks"),
        ]);
        setMembers(usersRes.data);
        setTasks(tasksRes.data);
      } catch (err) {
        console.error("Failed to load team:", err);
        setError("Could not load the team");
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Layout>
        <div className="p-8 flex-1">Loading team...</div>
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

  // Task numbers for one member (only accurate for Admin, who sees every task)
  const statsFor = (userId) => {
    const assigned = tasks.filter((t) => getId(t.assignedTo) === userId);
    return {
      open: assigned.filter((t) => t.status !== "Completed").length,
      completed: assigned.filter((t) => t.status === "Completed").length,
      overdue: assigned.filter(isOverdue).length,
    };
  };

  const visibleMembers = members
    .filter((m) => {
      const q = search.toLowerCase();
      return (
        m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q)
      );
    })
    // active members first, then alphabetical
    .sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  const activeCount = members.filter((m) => m.isActive).length;
  const adminCount = members.filter((m) => m.isActive && m.role === "Admin").length;
  const inactiveCount = members.length - activeCount;

  return (
    <Layout>
      <div className="p-8 flex-1">
        <h2 className="text-2xl font-bold text-gray-800 mb-1">Team</h2>
        <p className="text-gray-500 mb-6">
          {activeCount} active member{activeCount !== 1 && "s"} · {adminCount}{" "}
          admin{adminCount !== 1 && "s"}
          {isAdmin && inactiveCount > 0 && ` · ${inactiveCount} inactive`}
        </p>

        <input
          type="text"
          placeholder="Search by name or email..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 mb-6 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {visibleMembers.length === 0 ? (
          <p className="text-gray-500">No team members match your search.</p>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {visibleMembers.map((member) => {
              const stats = isAdmin ? statsFor(member._id) : null;
              const isYou = member._id === currentUser?._id;

              return (
                <div
                  key={member._id}
                  className={`bg-white p-5 rounded-lg shadow-sm ${
                    member.isActive ? "" : "opacity-60"
                  }`}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold shrink-0">
                      {initials(member.name)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-800 truncate">
                        {member.name}
                        {isYou && (
                          <span className="ml-2 text-xs font-medium text-gray-400">
                            (You)
                          </span>
                        )}
                      </p>
                      <p className="text-sm text-gray-500 truncate">
                        {member.email}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium ${roleColor[member.role]}`}
                    >
                      {member.role}
                    </span>
                    {!member.isActive && (
                      <span className="text-xs px-2 py-1 rounded-full font-medium bg-red-100 text-red-700">
                        Inactive
                      </span>
                    )}
                    <span className="text-xs text-gray-400">
                      Joined{" "}
                      {new Date(member.createdAt).toLocaleDateString(undefined, {
                        month: "short",
                        year: "numeric",
                      })}
                    </span>
                  </div>

                  {stats && (
                    <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-gray-100 text-center">
                      <div>
                        <p className="text-lg font-bold text-yellow-600">
                          {stats.open}
                        </p>
                        <p className="text-xs text-gray-500">Open</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-green-600">
                          {stats.completed}
                        </p>
                        <p className="text-xs text-gray-500">Done</p>
                      </div>
                      <div>
                        <p className="text-lg font-bold text-red-600">
                          {stats.overdue}
                        </p>
                        <p className="text-xs text-gray-500">Overdue</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}

export default TeamPage;  