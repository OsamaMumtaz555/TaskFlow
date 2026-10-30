// The sentence shown for each kind of notification
export const describeNotification = (n) => {
  const who = n.actor?.name || "Someone";
  const title = n.taskTitle || "a task";

  switch (n.type) {
    case "task_assigned":
      return `${who} assigned you a task: "${title}"`;
    case "task_unassigned":
      return `${who} removed you from the task: "${title}"`;
    case "task_status_changed":
      return `${who} changed "${title}" from ${n.fromStatus} to ${n.toStatus}`;
    case "task_deleted":
      return `${who} deleted the task: "${title}"`;
    default:
      return `${who} updated "${title}"`;
  }
};

// Only these notifications still point to a task the user can open
export const opensTask = (n) =>
  Boolean(n.task) &&
  (n.type === "task_assigned" || n.type === "task_status_changed");

// "just now", "5 min ago", "3 h ago", "2 d ago", or a short date
export const timeAgo = (value) => {
  const seconds = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (seconds < 60) return "just now";

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d ago`;

  return new Date(value).toLocaleDateString([], { day: "numeric", month: "short" });
};