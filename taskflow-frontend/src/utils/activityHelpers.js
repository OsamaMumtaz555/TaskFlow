// "2026-10-26" -> a local date; "none" stays "none"
const day = (value) =>
  !value || value === "none"
    ? "none"
    : new Date(`${value}T12:00:00`).toLocaleDateString();

// The sentence shown for each kind of activity (comments are shown separately)
export const describeActivity = (a) => {
  const who = a.actor?.name || "Someone";

  switch (a.kind) {
    case "created":
      return a.to
        ? `${who} created this task and assigned it to ${a.to}`
        : `${who} created this task`;
    case "title_changed":
      return `${who} renamed the task from "${a.from}" to "${a.to}"`;
    case "description_changed":
      return `${who} updated the description`;
    case "status_changed":
      return `${who} changed the status from ${a.from} to ${a.to}`;
    case "priority_changed":
      return `${who} changed the priority from ${a.from} to ${a.to}`;
    case "due_date_changed":
      return `${who} changed the due date from ${day(a.from)} to ${day(a.to)}`;
    case "assigned":
      return `${who} assigned the task to ${a.to}`;
    case "reassigned":
      return `${who} reassigned the task from ${a.from} to ${a.to}`;
    case "unassigned":
      return `${who} removed ${a.from} from the task`;
    default:
      return `${who} updated the task`;
  }
}; 