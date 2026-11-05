// STUN servers help each browser find its public address.
// (Day 5 adds a TURN server for strict office firewalls.)
export const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

// 83 seconds -> "01:23"
export const formatDuration = (totalSeconds = 0) => {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
};

const callLabel = (call) => (call.type === "video" ? "Video call" : "Voice call");

// Short text for the conversation list (same wording the server stores)
export const callPreview = (call) => {
  const label = callLabel(call);
  const lower = label.toLowerCase();
  const icon = call.type === "video" ? "🎥" : "📞";

  switch (call.status) {
    case "completed":
      return `${icon} ${label} · ${formatDuration(call.duration)}`;
    case "missed":
      return `${icon} Missed ${lower}`;
    case "cancelled":
      return `${icon} Cancelled ${lower}`;
    case "declined":
      return `${icon} Declined ${lower}`;
    default:
      return `${icon} ${label}`;
  }
};

// The line shown inside the conversation, from the point of view of the reader.
// mine = I was the one who made the call.
export const describeCallLog = (call, mine) => {
  const label = callLabel(call);
  const lower = label.toLowerCase();

  switch (call.status) {
    case "completed":
      return `${label} · ${formatDuration(call.duration)}`;
    case "missed":
      return mine ? `${label} · No answer` : `Missed ${lower}`;
    case "cancelled":
      return mine ? `${label} · Cancelled` : `Missed ${lower}`;
    case "declined":
      return mine ? `${label} · Declined` : `Declined ${lower}`;
    default:
      return label;
  }
};