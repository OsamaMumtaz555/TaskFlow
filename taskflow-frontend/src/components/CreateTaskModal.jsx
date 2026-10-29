import { useState, useEffect } from "react";
import api from "../api/api";

// message: the chat message the task is created from
// otherUser: the person on the other side of the conversation (default assignee)
function CreateTaskModal({ message, otherUser, onClose, onCreated }) {
  const text = message.text.trim();
  const firstLine = text.split("\n")[0].trim();
  const defaultTitle =
    firstLine.length > 120 ? `${firstLine.slice(0, 117)}...` : firstLine;

  const [title, setTitle] = useState(defaultTitle);
  // if the title is only part of the message, keep the whole message as description
  const [description, setDescription] = useState(
    text !== defaultTitle ? text : ""
  );
  const [assignedTo, setAssignedTo] = useState(
    otherUser && otherUser.isActive !== false ? otherUser._id : ""
  );
  const [priority, setPriority] = useState("Medium");
  const [dueDate, setDueDate] = useState("");
  const [shareInChat, setShareInChat] = useState(true);
  const [users, setUsers] = useState(
    otherUser && otherUser.isActive !== false ? [otherUser] : []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data } = await api.get("/users");
        setUsers(data.filter((u) => u.isActive !== false));
      } catch (err) {
        console.error("Failed to load users:", err);
      }
    };
    fetchUsers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!title.trim()) {
      setError("Title cannot be empty");
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post("/tasks", {
        title: title.trim(),
        description,
        priority,
        dueDate: dueDate || null,
        assignedTo,
        sourceMessageId: message._id,
      });
      onCreated(data, shareInChat);
    } catch (err) {
      console.error("Failed to create task:", err);
      setError(err.response?.data?.message || "Could not create the task");
      setSaving(false);
    }
  };

  const inputClass =
    "w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-lg w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-xl font-bold text-gray-800 mb-1">
          Create task from message
        </h3>
        <p className="text-sm text-gray-500 mb-4 truncate">
          From {message.sender?.name}: "{text}"
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Assign to
              </label>
              <select
                value={assignedTo}
                onChange={(e) => setAssignedTo(e.target.value)}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {users.map((u) => (
                  <option key={u._id} value={u._id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className={inputClass}
              >
                <option value="Low">Low</option>
                <option value="Medium">Medium</option>
                <option value="High">High</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Due date
            </label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputClass}
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={shareInChat}
              onChange={(e) => setShareInChat(e.target.checked)}
            />
            Share this task in the chat
          </label>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex justify-end gap-3 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 text-white font-semibold px-4 py-2 rounded-md hover:bg-blue-700 transition disabled:opacity-60"
            >
              {saving ? "Creating..." : "Create Task"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTaskModal;