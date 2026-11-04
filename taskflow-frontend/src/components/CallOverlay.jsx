import { initials } from "../utils/chatHelpers";
import { formatDuration } from "../utils/callHelpers";

function CallOverlay({
  call,
  muted,
  elapsed,
  notice,
  onAccept,
  onDecline,
  onHangup,
  onToggleMute,
}) {
  const incomingRinging =
    call && call.direction === "incoming" && call.status === "ringing";

  let statusText = "";
  if (call && !incomingRinging) {
    if (call.status === "ringing") statusText = "Calling...";
    else if (call.status === "connecting") statusText = "Connecting...";
    else if (call.reconnecting) statusText = "Reconnecting...";
    else statusText = formatDuration(elapsed);
  }

  return (
    <>
      {/* Someone is calling me */}
      {incomingRinging && (
        <div className="fixed top-20 right-6 z-[60] w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold animate-pulse shrink-0">
              {initials(call.peer.name)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-800 truncate">{call.peer.name}</p>
              <p className="text-sm text-gray-500">Incoming voice call...</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={onDecline}
              className="flex-1 bg-red-600 text-white font-semibold py-2 rounded-md hover:bg-red-700 transition"
            >
              Decline
            </button>
            <button
              onClick={onAccept}
              className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-md hover:bg-green-700 transition"
            >
              Accept
            </button>
          </div>
        </div>
      )}

      {/* A call in progress: calling, connecting or talking */}
      {call && !incomingRinging && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-80 bg-gray-900 text-white rounded-xl shadow-2xl p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold shrink-0">
              {initials(call.peer.name)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{call.peer.name}</p>
              <p className="text-sm text-gray-300">{statusText}</p>
              {call.remoteMuted && call.status === "active" && (
                <p className="text-xs text-yellow-300">{call.peer.name} is muted</p>
              )}
            </div>
          </div>

          <div className="flex gap-3">
            {call.status !== "ringing" && (
              <button
                onClick={onToggleMute}
                className={`flex-1 font-semibold py-2 rounded-md transition ${
                  muted
                    ? "bg-yellow-400 text-gray-900 hover:bg-yellow-300"
                    : "bg-gray-700 text-white hover:bg-gray-600"
                }`}
              >
                {muted ? "Unmute" : "Mute"}
              </button>
            )}
            <button
              onClick={onHangup}
              className="flex-1 bg-red-600 text-white font-semibold py-2 rounded-md hover:bg-red-700 transition"
            >
              {call.status === "ringing" ? "Cancel" : "Hang up"}
            </button>
          </div>
        </div>
      )}

      {/* Short messages: call ended, missed, microphone problems... */}
      {notice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] max-w-md bg-gray-900 text-white text-sm rounded-lg shadow-lg px-4 py-3">
          {notice}
        </div>
      )}
    </>
  );
}

export default CallOverlay;