import { statusColor, priorityColor, isOverdue } from "../utils/taskHelpers";

// task = summary from the server, or null if the task was deleted
function SharedTaskCard({ task, title, onOpen }) {
  if (!task) {
    return (
      <div className="bg-white/90 text-gray-500 rounded-lg p-3 mt-1 border border-dashed border-gray-300">
        <p className="text-[11px] uppercase tracking-wide mb-1">Task</p>
        <p className="font-medium text-gray-600">{title}</p>
        <p className="text-xs mt-1">This task is no longer available.</p>
      </div>
    );
  }

  const overdue = isOverdue(task);

  return (
    <button
      type="button"
      onClick={() => onOpen(task._id)}
      className="block w-full text-left bg-white text-gray-800 rounded-lg p-3 mt-1 border border-gray-200 hover:shadow-md transition"
    >
      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">
        Task
      </p>
      <p className="font-semibold">{task.title}</p>

      <div className="flex flex-wrap items-center gap-2 mt-2">
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
      </div>

      <p className="text-xs text-gray-500 mt-2">
        {task.assignedTo ? `Assigned to ${task.assignedTo.name}` : "Unassigned"}
        {task.dueDate && (
          <span className={overdue ? "text-red-600 font-medium" : ""}>
            {" · "}Due {new Date(task.dueDate).toLocaleDateString()}
            {overdue && " (overdue)"}
          </span>
        )}
      </p>
    </button>
  );
}

export default SharedTaskCard;