import { useState, useEffect } from "react";
import api from "../api/api";
import { initials } from "../utils/chatHelpers";

function NewChatModal({ currentUserId, onClose, onPick }) {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [startingId, setStartingId] = useState(null);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data } = await api.get("/users");
        setUsers(data);
      } catch (err) {
        console.error("Failed to load users:", err);
        setError("Could not load teammates");
      } finally {
        setLoading(false);
      }
    };
    fetchUsers();
  }, []);

  const handlePick = async (userId) => {
    setError("");
    setStartingId(userId);
    try {
      await onPick(userId); // the parent closes this modal on success
    } catch (err) {
      console.error("Failed to start chat:", err);
      setError(err.response?.data?.message || "Could not start chat");
      setStartingId(null);
    }
  };

  const q = search.toLowerCase();
  const list = users.filter(
    (u) =>
      u._id !== currentUserId &&
      u.isActive !== false &&
      (u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))
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
        <h3 className="text-xl font-bold text-gray-800 mb-4">Start a new chat</h3>

        <input
          type="text"
          placeholder="Search teammates..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-gray-300 rounded-md px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

        <div className="max-h-72 overflow-y-auto">
          {loading ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : list.length === 0 ? (
            <p className="text-sm text-gray-500">No teammates found.</p>
          ) : (
            list.map((user) => (
              <button
                key={user._id}
                onClick={() => handlePick(user._id)}
                disabled={startingId !== null}
                className="w-full text-left flex items-center gap-3 px-2 py-2 rounded-md hover:bg-gray-50 disabled:opacity-60"
              >
                <div className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold shrink-0">
                  {initials(user.name)}
                </div>
                <div className="min-w-0">
                  <p className="font-medium text-gray-800 truncate">{user.name}</p>
                  <p className="text-xs text-gray-500 truncate">
                    {user.role} · {user.email}
                  </p>
                </div>
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

export default NewChatModal; 