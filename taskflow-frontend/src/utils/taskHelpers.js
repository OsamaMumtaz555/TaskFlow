// createdBy / assignedTo can be a populated object or a plain id string
export const getId = (value) =>
  value && typeof value === "object" ? value._id : value;

export const getCurrentUser = () => JSON.parse(localStorage.getItem("user"));

export const statusColor = {
  Completed: "bg-green-100 text-green-700",
  "In Progress": "bg-yellow-100 text-yellow-700",
  Pending: "bg-gray-200 text-gray-700",
};

export const priorityColor = {
  High: "bg-red-100 text-red-700", 
  Medium: "bg-blue-100 text-blue-700",
  Low: "bg-gray-100 text-gray-600",
};

// Overdue = not completed and the due DAY has fully passed
export const isOverdue = (task) => {
  if (!task.dueDate || task.status === "Completed") return false;
  const endOfDueDay = new Date(task.dueDate);
  endOfDueDay.setUTCHours(23, 59, 59, 999);
  return endOfDueDay < new Date();  

};
 
// Merge new values into the saved user (keeps the token and role from login)
export const saveCurrentUser = (updates) => {
  const merged = { ...getCurrentUser(), ...updates };
  localStorage.setItem("user", JSON.stringify(merged));
  return merged;
};