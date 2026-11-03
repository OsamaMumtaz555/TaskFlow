// Same rules as the server (the server enforces them again)
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_EXTENSIONS = [
  ".jpg", ".jpeg", ".png", ".gif", ".webp",
  ".pdf", ".txt", ".csv",
  ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".zip",
];

// for <input type="file" accept="...">
export const ACCEPT = ALLOWED_EXTENSIONS.join(",");

// "Report.final.PDF" -> "pdf"
export const extensionOf = (name = "") => {
  const dot = name.lastIndexOf(".");
  return dot === -1 ? "" : name.slice(dot + 1).toLowerCase();
};

// Returns a problem message, or "" if the file is fine
export const validateFile = (file) => {
  if (!ALLOWED_EXTENSIONS.includes(`.${extensionOf(file.name)}`)) {
    return "This file type is not allowed";
  }
  if (file.size === 0) return "The file is empty";
  if (file.size > MAX_FILE_SIZE) {
    return `The file is too large (maximum ${MAX_FILE_SIZE / 1024 / 1024} MB)`;
  }
  return "";
};

export const formatSize = (bytes = 0) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export const isImageType = (mimeType = "") => mimeType.startsWith("image/");

// Colour of the small type badge
export const badgeColor = (name) => {
  const ext = extensionOf(name);
  if (ext === "pdf") return "bg-red-100 text-red-700";
  if (["doc", "docx"].includes(ext)) return "bg-blue-100 text-blue-700";
  if (["xls", "xlsx", "csv"].includes(ext)) return "bg-green-100 text-green-700";
  if (["ppt", "pptx"].includes(ext)) return "bg-orange-100 text-orange-700";
  if (ext === "zip") return "bg-yellow-100 text-yellow-700";
  return "bg-gray-100 text-gray-700";
};