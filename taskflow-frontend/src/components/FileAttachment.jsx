import { useState, useEffect } from "react";
import api from "../api/api";
import {
  formatSize,
  extensionOf,
  badgeColor,
  isImageType,
} from "../utils/fileHelpers";

const fileEndpoint = (conversationId, messageId) =>
  `/chats/${conversationId}/messages/${messageId}/file`;

// Saves a blob to the computer under the original file name
const saveBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

// Full-screen view of an image (Esc or a click outside closes it)
function ImageViewer({ url, name, onClose, onDownload, downloading }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex flex-col items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <img
        src={url}
        alt={name}
        className="max-h-[80vh] max-w-full rounded-lg"
        onClick={(e) => e.stopPropagation()}
      />
      <div
        className="flex items-center gap-4 mt-4 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm truncate max-w-xs">{name}</span>
        <button
          onClick={onDownload}
          disabled={downloading}
          className="bg-white text-gray-800 text-sm font-medium px-3 py-1.5 rounded-md hover:bg-gray-100 disabled:opacity-60"
        >
          {downloading ? "Downloading..." : "Download"}
        </button>
        <button
          onClick={onClose}
          className="border border-white/60 text-sm px-3 py-1.5 rounded-md hover:bg-white/10"
        >
          Close
        </button>
      </div>
    </div>
  );
}

function FileAttachment({ conversationId, message }) {
  const { attachment } = message;
  const image = isImageType(attachment.mimeType);

  const [imageUrl, setImageUrl] = useState(null);
  const [imageFailed, setImageFailed] = useState(false);
  const [viewing, setViewing] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  // Images are private, so they are fetched with the login token and shown from memory
  useEffect(() => {
    if (!image) return;

    let objectUrl = null;
    let cancelled = false;

    api
      .get(fileEndpoint(conversationId, message._id), { responseType: "blob" })
      .then(({ data }) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(data);
        setImageUrl(objectUrl);
      })
      .catch((err) => {
        console.error("Failed to load image:", err);
        if (!cancelled) setImageFailed(true);
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [conversationId, message._id, image]);

  const handleDownload = async () => {
    setDownloading(true);
    setError("");
    try {
      const { data } = await api.get(fileEndpoint(conversationId, message._id), {
        params: { download: 1 },
        responseType: "blob",
      });
      saveBlob(data, attachment.originalName);
    } catch (err) {
      console.error("Failed to download file:", err);
      setError(
        err.response?.status === 404
          ? "The file is no longer available"
          : "Could not download the file"
      );
    } finally {
      setDownloading(false);
    }
  };

  const errorLine = error && (
    <p className="text-xs text-red-600 bg-white rounded px-2 py-1 mt-1">{error}</p>
  );

  // ---- an image: thumbnail ----
  if (image && !imageFailed) {
    return (
      <div className="mt-1">
        {imageUrl ? (
          <button type="button" onClick={() => setViewing(true)} className="block">
              <img
              src={imageUrl}
              alt={attachment.originalName}
              onError={() => setImageFailed(true)}
              className="max-h-52 max-w-full rounded-lg object-cover"
            /> 
          </button>
        ) : (
          <div className="h-32 w-48 rounded-lg bg-white/60 animate-pulse" />
        )}
        <p className="text-xs mt-1 opacity-80 truncate">
          {attachment.originalName} · {formatSize(attachment.size)}
        </p>
        {errorLine}

        {viewing && imageUrl && (
          <ImageViewer
            url={imageUrl}
            name={attachment.originalName}
            onClose={() => setViewing(false)}
            onDownload={handleDownload}
            downloading={downloading}
          />
        )}
      </div>
    );
  }

  // ---- any other file: a card ----
  return (
    <div className="mt-1">
      <div className="bg-white text-gray-800 rounded-lg p-3 border border-gray-200 flex items-center gap-3">
        <span
          className={`text-xs font-bold px-2 py-1.5 rounded shrink-0 ${badgeColor(attachment.originalName)}`}
        >
          {extensionOf(attachment.originalName).toUpperCase() || "FILE"}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{attachment.originalName}</p>
          <p className="text-xs text-gray-500">{formatSize(attachment.size)}</p>
        </div>
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50 shrink-0"
        >
          {downloading ? "..." : "Download"}
        </button>
      </div>
      {errorLine}
    </div>
  );
}

export default FileAttachment;  