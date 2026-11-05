import { useState, useEffect, useRef } from "react";
import { initials } from "../utils/chatHelpers";
import { formatDuration } from "../utils/callHelpers";

// Shows a media stream. My own preview is always muted (otherwise I would hear myself).
function VideoTile({ stream, muted = false, mirrored = false, className = "" }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream || null;
  }, [stream]);

  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted={muted}
      className={className}
      style={mirrored ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

// Invisible, but it still plays the other person's voice
const SOUND_ONLY = "absolute w-px h-px opacity-0 pointer-events-none";

const controlClass = (highlight) =>
  `flex-1 text-sm font-semibold py-2 px-2 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed ${
    highlight
      ? "bg-yellow-400 text-gray-900 hover:bg-yellow-300"
      : "bg-gray-700 text-white hover:bg-gray-600"
  }`;

function CallOverlay({
  call,
  muted,
  cameraOff,
  hasCamera,
  sharing,
  canShare,
  elapsed,
  notice,
  localStream,
  remoteStream,
  remoteHasVideo,
  onAccept,
  onDecline,
  onHangup,
  onToggleMute,
  onToggleCamera,
  onToggleShare,
}) {
  const [expanded, setExpanded] = useState(false);
  const [stickyVideo, setStickyVideo] = useState(false);

  const sharingOrWatching = Boolean(sharing || call?.remoteScreen);

  // Once a screen was shared, keep the large layout until the call ends (no flicker)
  useEffect(() => {
    if (!call) {
      setExpanded(false);
      setStickyVideo(false);
    } else if (sharingOrWatching) {
      setStickyVideo(true);
    }
  }, [call, sharingOrWatching]);

  const incomingRinging =
    call && call.direction === "incoming" && call.status === "ringing";
  const isVideoCall = call?.type === "video";
  const videoLayout =
    Boolean(call) && !incomingRinging && (isVideoCall || stickyVideo || sharingOrWatching);
  const audioLayout = Boolean(call) && !incomingRinging && !videoLayout;
  const active = call?.status === "active";

  let statusText = "";
  if (call && !incomingRinging) {
    if (call.status === "ringing") statusText = "Calling...";
    else if (call.status === "connecting") statusText = "Connecting...";
    else if (call.reconnecting) statusText = "Reconnecting...";
    else statusText = formatDuration(elapsed);
  }

  // what the big picture shows
  const showRemoteVideo =
    videoLayout &&
    call?.status !== "ringing" &&
    remoteHasVideo &&
    (call?.remoteScreen || !call?.remoteVideoOff);
  const showLocalMain =
    videoLayout && call?.status === "ringing" && hasCamera && !cameraOff;
  const myCameraShown = hasCamera && !cameraOff;

  // when there is no picture to show, say why
  let placeholderNote = "";
  if (active) {
    placeholderNote = remoteHasVideo
      ? call.remoteVideoOff && !call.remoteScreen
        ? "Camera is off"
        : ""
      : "Audio only";
  }

  const shareButton = canShare && active && (
    <button onClick={onToggleShare} className={controlClass(sharing)}>
      {sharing ? "Stop sharing" : "Share screen"}
    </button>
  );

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
              <p className="text-sm text-gray-500">
                Incoming {isVideoCall ? "video" : "voice"} call...
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onDecline}
              className="flex-1 bg-red-600 text-white font-semibold py-2 rounded-md hover:bg-red-700 transition"
            >
              Decline
            </button>
            {isVideoCall && (
              <button
                onClick={() => onAccept(false)}
                className="flex-1 bg-gray-200 text-gray-800 font-semibold py-2 rounded-md hover:bg-gray-300 transition text-sm"
              >
                Audio only
              </button>
            )}
            <button
              onClick={() => onAccept(true)}
              className="flex-1 bg-green-600 text-white font-semibold py-2 rounded-md hover:bg-green-700 transition"
            >
              Accept
            </button>
          </div>
        </div>
      )}

      {/* A voice call in progress (small card) */}
      {audioLayout && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] w-80 bg-gray-900 text-white rounded-xl shadow-2xl p-5">
          <VideoTile stream={remoteStream} className={SOUND_ONLY} />

          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white flex items-center justify-center font-semibold shrink-0">
              {initials(call.peer.name)}
            </div>
            <div className="min-w-0">
              <p className="font-semibold truncate">{call.peer.name}</p>
              <p className="text-sm text-gray-300">{statusText}</p>
              {call.remoteMuted && active && (
                <p className="text-xs text-yellow-300">{call.peer.name} is muted</p>
              )}
            </div>
          </div>

          <div className="flex gap-2">
            {call.status !== "ringing" && (
              <button onClick={onToggleMute} className={controlClass(muted)}>
                {muted ? "Unmute" : "Mute"}
              </button>
            )}
            {shareButton}
            <button
              onClick={onHangup}
              className="flex-1 text-sm bg-red-600 text-white font-semibold py-2 rounded-md hover:bg-red-700 transition"
            >
              {call.status === "ringing" ? "Cancel" : "Hang up"}
            </button>
          </div>
        </div>
      )}

      {/* A video call, or any call with a shared screen (large panel) */}
      {videoLayout && (
        <div
          className={`fixed z-[60] bg-gray-900 text-white rounded-xl shadow-2xl overflow-hidden flex flex-col ${
            expanded ? "inset-6" : "bottom-6 left-1/2 -translate-x-1/2 w-[30rem]"
          }`}
        >
          {/* the picture area */}
          <div className={`relative bg-black ${expanded ? "flex-1 min-h-0" : "aspect-video"}`}>
            {/* the other person: always mounted (it also carries their voice) */}
            <VideoTile
              stream={remoteStream}
              className={
                showRemoteVideo
                  ? "absolute inset-0 w-full h-full object-contain bg-black"
                  : SOUND_ONLY
              }
            />

            {/* while ringing, I see myself full size */}
            {call.status === "ringing" && (
              <VideoTile
                stream={localStream}
                muted
                mirrored
                className={
                  showLocalMain ? "absolute inset-0 w-full h-full object-cover" : "hidden"
                }
              />
            )}

            {/* nothing to show: avatar and a short reason */}
            {!showRemoteVideo && !showLocalMain && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <div className="w-20 h-20 rounded-full bg-blue-600 text-white flex items-center justify-center text-2xl font-semibold">
                  {initials(call.peer.name)}
                </div>
                {placeholderNote && (
                  <p className="text-sm text-gray-300">{placeholderNote}</p>
                )}
              </div>
            )}

            {/* name, time and state */}
            <div className="absolute top-3 left-3 bg-black/50 rounded-md px-3 py-1.5">
              <p className="text-sm font-semibold">{call.peer.name}</p>
              <p className="text-xs text-gray-200">{statusText}</p>
              {call.remoteScreen && active && (
                <p className="text-xs text-green-300">Sharing their screen</p>
              )}
              {sharing && (
                <p className="text-xs text-green-300">You are sharing your screen</p>
              )}
              {call.remoteMuted && active && (
                <p className="text-xs text-yellow-300">Muted</p>
              )}
            </div>

            <button
              onClick={() => setExpanded((value) => !value)}
              className="absolute top-3 right-3 bg-black/50 hover:bg-black/70 text-xs px-3 py-1.5 rounded-md transition"
            >
              {expanded ? "Shrink" : "Expand"}
            </button>

            {/* my own picture in the corner */}
            {call.status !== "ringing" && (
              <div className="absolute bottom-3 right-3 w-28 aspect-video rounded-md overflow-hidden border border-white/30 bg-gray-800">
                <VideoTile
                  stream={localStream}
                  muted
                  mirrored
                  className={`w-full h-full object-cover ${myCameraShown ? "" : "hidden"}`}
                />
                {!myCameraShown && (
                  <div className="w-full h-full flex items-center justify-center text-[11px] text-gray-300">
                    {isVideoCall ? "Camera off" : "No camera"}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* the buttons */}
          <div className="p-4 flex gap-2">
            {call.status !== "ringing" && (
              <>
                <button onClick={onToggleMute} className={controlClass(muted)}>
                  {muted ? "Unmute" : "Mute"}
                </button>
                {isVideoCall && (
                  <button
                    onClick={onToggleCamera}
                    disabled={!hasCamera}
                    className={controlClass(cameraOff)}
                  >
                    {cameraOff ? "Camera on" : "Camera off"}
                  </button>
                )}
              </>
            )}
            {shareButton}
            <button
              onClick={onHangup}
              className="flex-1 text-sm bg-red-600 text-white font-semibold py-2 rounded-md hover:bg-red-700 transition"
            >
              {call.status === "ringing" ? "Cancel" : "Hang up"}
            </button>
          </div>
        </div>
      )}

      {/* Short messages: call ended, missed, camera or microphone problems... */}
      {notice && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[70] max-w-md bg-gray-900 text-white text-sm rounded-lg shadow-lg px-4 py-3">
          {notice}
        </div>
      )}
    </>
  );
}

export default CallOverlay;