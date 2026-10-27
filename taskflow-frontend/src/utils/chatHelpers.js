export const initials = (name = "") =>
  name
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const isSameDay = (a, b) =>
  new Date(a).toDateString() === new Date(b).toDateString();

export const formatTime = (value) =>
  new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

// Today -> time, otherwise a short date (used in the conversation list)
export const formatListTime = (value) =>
  isSameDay(value, new Date())
    ? formatTime(value)
    : new Date(value).toLocaleDateString([], { day: "numeric", month: "short" });

// Separator label inside a conversation
export const dayLabel = (value) => {
  const date = new Date(value);
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (isSameDay(date, new Date())) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";
  return date.toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
};