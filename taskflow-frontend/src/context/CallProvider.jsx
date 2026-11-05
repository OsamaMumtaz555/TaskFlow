import { useState, useEffect, useRef, useMemo } from "react";
import CallContext from "./callContext";
import CallOverlay from "../components/CallOverlay";
import { getSocket, onSocketChange } from "../socket";
import { ICE_SERVERS, formatDuration } from "../utils/callHelpers";
import { startRingtone, stopRingtone } from "../utils/ringtone";

const AUDIO_CONSTRAINTS = { echoCancellation: true, noiseSuppression: true };
const VIDEO_CONSTRAINTS = {
  width: { ideal: 1280 },
  height: { ideal: 720 },
  frameRate: { ideal: 24 },
};

// Turns browser microphone errors into friendly messages
const microphoneError = (err) => {
  if (err.name === "NotAllowedError") {
    return new Error(
      "Microphone access was blocked. Allow it in the browser address bar and try again."
    );
  }
  if (err.name === "NotFoundError") {
    return new Error("No microphone was found on this device.");
  }
  return new Error("Could not use the microphone.");
};

// Asks for the microphone, and the camera too when wantVideo is true.
// If the camera cannot be used (none, blocked, busy), it falls back to the microphone only.
const getMedia = async (wantVideo) => {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Calls need a secure page (https) and a modern browser.");
  }

  if (wantVideo) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: AUDIO_CONSTRAINTS,
        video: VIDEO_CONSTRAINTS,
      });
      return { stream, hasVideo: true };
    } catch (err) {
      console.warn("Camera not available, trying the microphone only:", err.name);
    }
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: AUDIO_CONSTRAINTS,
    });
    return { stream, hasVideo: false };
  } catch (err) {
    throw microphoneError(err);
  }
};

const CAMERA_FALLBACK_NOTICE = "Camera unavailable, continuing with audio only.";

function CallProvider({ children }) {
  // call = { id, conversationId, type: "audio" | "video", direction: "outgoing" | "incoming",
  //          peer: { _id, name }, status: "ringing" | "connecting" | "active",
  //          startedAt, reconnecting, remoteMuted, remoteVideoOff }   (null = no call)
  const [call, setCall] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [hasCamera, setHasCamera] = useState(false); // my stream has a video track
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState("");

  const callRef = useRef(null); // the same call, readable from event handlers
  const pcRef = useRef(null); // the WebRTC connection
  const localStreamRef = useRef(null); // my camera and microphone
  const pendingCandidates = useRef([]); // network routes that arrived too early
  const startingRef = useRef(false); // a call is being started (permission prompt open)
  const endNoticeRef = useRef(""); // message to show when I end the call myself because of an error
  const latest = useRef({}); // always the newest version of the functions below

  const updateCall = (next) => {
    callRef.current = next;
    setCall(next);
  };

  // Stops the camera and microphone, closes the WebRTC connection, stops the ringtone
  const cleanupMedia = () => {
    stopRingtone();

    const pc = pcRef.current;
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
      pcRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingCandidates.current = [];

    setLocalStream(null);
    setRemoteStream(null);
    setRemoteHasVideo(false);
    setHasCamera(false);
    setMuted(false);
    setCameraOff(false);
    setElapsed(0);
  };

  // The call is over on this device
  const finishCall = (message) => {
    cleanupMedia();
    updateCall(null);
    if (message) setNotice(message);
  };

  const sendSignal = (callId, data) => {
    getSocket()?.emit("webrtc:signal", { callId, data });
  };

  // Creates the WebRTC connection and wires it up
  const createPeer = (callId) => {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    const stream = localStreamRef.current;

    // send my microphone (and camera) to the other person
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // In a video call, always be ready to RECEIVE video, even if I have no camera
    if (callRef.current?.type === "video" && stream.getVideoTracks().length === 0) {
      pc.addTransceiver("video", { direction: "recvonly" });
    }

    // every network route my browser finds is passed to the other browser
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(callId, { candidate: event.candidate.toJSON() });
      }
    };

    // the other person's voice and picture arrive here
    pc.ontrack = (event) => {
      if (event.streams[0]) setRemoteStream(event.streams[0]);
      if (event.track.kind === "video") setRemoteHasVideo(true);
    };

    pc.onconnectionstatechange = () => {
      const current = callRef.current;
      if (!current || current.id !== callId) return;

      if (pc.connectionState === "connected") {
        updateCall({
          ...current,
          status: "active",
          startedAt: current.startedAt || Date.now(),
          reconnecting: false,
        });
      } else if (pc.connectionState === "disconnected") {
        updateCall({ ...current, reconnecting: true });
      } else if (pc.connectionState === "failed") {
        latest.current.hangUp("The connection failed. Check your network and try again.");
      }
    };

    pcRef.current = pc;
    return pc;
  };

  // candidates that arrived before the offer/answer can be used now
  const flushCandidates = async (pc) => {
    const queued = pendingCandidates.current;
    pendingCandidates.current = [];
    for (const candidate of queued) {
      try {
        await pc.addIceCandidate(candidate);
      } catch (err) {
        console.error("Could not add an ICE candidate:", err);
      }
    }
  };

  // ---------- actions (used by the buttons) ----------

  // Hang up, cancel a ringing call, or decline an incoming one
  const hangUp = (errorNotice) => {
    const current = callRef.current;
    if (!current) return;
    if (errorNotice) endNoticeRef.current = errorNotice;

    const socket = getSocket();
    if (!socket?.connected) {
      finishCall(errorNotice || "Call ended");
      return;
    }
    // the server answers with call:ended, which closes everything on both sides
    socket.emit("call:hangup", { callId: current.id }, (reply) => {
      if (!reply?.ok) finishCall(errorNotice || "Call ended");
    });
  };

  // Called from the call buttons in the chat header
  const startCall = async (conversation, type = "audio") => {
    if (callRef.current || startingRef.current) return;

    const socket = getSocket();
    if (!socket?.connected) {
      setNotice("Not connected to the server. Please try again in a moment.");
      return;
    }

    startingRef.current = true;
    let media;
    try {
      media = await getMedia(type === "video"); // the permission prompt appears here
    } catch (err) {
      startingRef.current = false;
      setNotice(err.message);
      return;
    }

    localStreamRef.current = media.stream;
    setLocalStream(media.stream);
    setHasCamera(media.hasVideo);
    if (type === "video" && !media.hasVideo) setNotice(CAMERA_FALLBACK_NOTICE);

    socket.timeout(8000).emit(
      "call:invite",
      { conversationId: conversation._id, type },
      (err, reply) => {
        startingRef.current = false;
        if (err || !reply?.ok) {
          cleanupMedia();
          setNotice(err ? "The server did not respond." : reply.error);
          return;
        }
        updateCall({
          id: reply.callId,
          conversationId: conversation._id,
          type,
          direction: "outgoing",
          peer: { _id: conversation.other._id, name: conversation.other.name },
          status: "ringing",
        });
      }
    );
  };

  // withVideo = false means "audio only", even for a video call
  const acceptCall = async (withVideo = true) => {
    const current = callRef.current;
    if (!current || current.direction !== "incoming" || current.status !== "ringing") {
      return;
    }
    stopRingtone();

    const wantVideo = current.type === "video" && withVideo;
    let media;
    try {
      media = await getMedia(wantVideo);
    } catch (err) {
      // no microphone: decline the call and say why
      getSocket()?.emit("call:hangup", { callId: current.id });
      finishCall(err.message);
      return;
    }

    // the call may have been cancelled while the permission prompt was open
    if (!callRef.current || callRef.current.id !== current.id) {
      media.stream.getTracks().forEach((track) => track.stop());
      return;
    }

    localStreamRef.current = media.stream;
    setLocalStream(media.stream);
    setHasCamera(media.hasVideo);
    if (wantVideo && !media.hasVideo) setNotice(CAMERA_FALLBACK_NOTICE);

    getSocket()?.emit("call:accept", { callId: current.id }, (reply) => {
      if (!reply?.ok) finishCall("This call is no longer available.");
    });
    updateCall({ ...callRef.current, status: "connecting" });
  };

  const toggleMute = () => {
    const stream = localStreamRef.current;
    const current = callRef.current;
    if (!stream || !current) return;

    const nextMuted = !muted;
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMuted(nextMuted);
    getSocket()?.emit("call:media", {
      callId: current.id,
      audio: !nextMuted,
      video: !cameraOff,
      screen: false,
    });
  };

  const toggleCamera = () => {
    const stream = localStreamRef.current;
    const current = callRef.current;
    if (!stream || !current || stream.getVideoTracks().length === 0) return;

    const nextCameraOff = !cameraOff;
    stream.getVideoTracks().forEach((track) => {
      track.enabled = !nextCameraOff; // keeps the connection, just stops sending real pictures
    });
    setCameraOff(nextCameraOff);
    getSocket()?.emit("call:media", {
      callId: current.id,
      audio: !muted,
      video: !nextCameraOff,
      screen: false,
    });
  };

  // ---------- events from the server ----------

  // Someone is calling me
  const onIncoming = ({ callId, conversationId, type, caller }) => {
    if (callRef.current) return; // already busy (the server normally prevents this)
    updateCall({
      id: callId,
      conversationId,
      type,
      direction: "incoming",
      peer: caller,
      status: "ringing",
    });
    startRingtone();
  };

  // The other person picked up: I (the caller) now create the WebRTC offer
  const onAccepted = async ({ callId }) => {
    const current = callRef.current;
    if (!current || current.id !== callId || current.direction !== "outgoing") return;

    updateCall({ ...current, status: "connecting" });
    try {
      const pc = createPeer(callId);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendSignal(callId, { description: { type: offer.type, sdp: offer.sdp } });
    } catch (err) {
      console.error("Could not create the offer:", err);
      hangUp("Could not start the call.");
    }
  };

  // Messages of the WebRTC handshake from the other browser
  const onSignal = async ({ callId, data }) => {
    const current = callRef.current;
    if (!current || current.id !== callId || !data) return;

    try {
      if (data.description) {
        if (data.description.type === "offer") {
          // I am the callee: answer the offer
          const pc = pcRef.current || createPeer(callId);
          await pc.setRemoteDescription(data.description);
          await flushCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(callId, { description: { type: answer.type, sdp: answer.sdp } });
        } else if (data.description.type === "answer" && pcRef.current) {
          // I am the caller: the answer arrived
          await pcRef.current.setRemoteDescription(data.description);
          await flushCandidates(pcRef.current);
        }
      } else if (data.candidate) {
        const pc = pcRef.current;
        if (pc && pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else pendingCandidates.current.push(data.candidate); // too early: keep it for later
      }
    } catch (err) {
      console.error("Signaling error:", err);
    }
  };

  // The server says the call is over (for any reason)
  const onEnded = ({ callId, reason, duration }) => {
    const current = callRef.current;
    if (!current || current.id !== callId) return;

    const name = current.peer.name;
    const outgoing = current.direction === "outgoing";

    let message = "Call ended";
    if (reason === "hangup") message = `Call ended · ${formatDuration(duration)}`;
    else if (reason === "rejected") message = outgoing ? `${name} declined the call` : "Call declined";
    else if (reason === "cancelled") message = outgoing ? "Call cancelled" : `Missed call from ${name}`;
    else if (reason === "missed") message = outgoing ? `${name} did not answer` : `Missed call from ${name}`;
    else if (reason === "disconnected") message = "The call was disconnected";

    const override = endNoticeRef.current;
    endNoticeRef.current = "";
    finishCall(override || message);
  };

  // I answered on another tab: stop ringing here
  const onHandled = ({ callId }) => {
    const current = callRef.current;
    if (current && current.id === callId && current.status === "ringing") {
      finishCall();
    }
  };

  // The other person muted / unmuted or turned their camera off / on
  const onMedia = ({ callId, audio, video }) => {
    const current = callRef.current;
    if (current && current.id === callId) {
      updateCall({ ...current, remoteMuted: !audio, remoteVideoOff: !video });
    }
  };

  // My own connection to the server dropped
  const onSocketDisconnect = () => {
    if (callRef.current) finishCall("Connection to the server was lost.");
  };

  // keep "latest" pointing at the newest functions after every render
  useEffect(() => {
    latest.current = {
      hangUp,
      startCall,
      onIncoming,
      onAccepted,
      onSignal,
      onEnded,
      onHandled,
      onMedia,
      onSocketDisconnect,
    };
  });

  // Follow the socket: listen to call events on whichever socket is current
  useEffect(() => {
    const events = {
      "call:incoming": (data) => latest.current.onIncoming(data),
      "call:accepted": (data) => latest.current.onAccepted(data),
      "webrtc:signal": (data) => latest.current.onSignal(data),
      "call:ended": (data) => latest.current.onEnded(data),
      "call:handled": (data) => latest.current.onHandled(data),
      "call:media": (data) => latest.current.onMedia(data),
      disconnect: () => latest.current.onSocketDisconnect(),
    };

    let detach = () => {};

    const unsubscribe = onSocketChange((socket) => {
      detach();
      detach = () => {};

      if (!socket) {
        // logged out: nothing may keep running
        if (callRef.current) finishCall();
        return;
      }

      Object.entries(events).forEach(([name, handler]) => socket.on(name, handler));
      detach = () =>
        Object.entries(events).forEach(([name, handler]) => socket.off(name, handler));
    });

    return () => {
      unsubscribe();
      detach();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The call timer
  const status = call?.status;
  const startedAt = call?.startedAt;
  useEffect(() => {
    if (status !== "active" || !startedAt) return;
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000));
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [status, startedAt]);

  // Hide the short message after 5 seconds
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);

  // Stable, so components that use useCall() don't re-render every second
  const inCall = Boolean(call);
  const value = useMemo(
    () => ({
      inCall,
      startCall: (conversation, type) => latest.current.startCall(conversation, type),
    }),
    [inCall]
  );

  return (
    <CallContext.Provider value={value}>
      {children}

      <CallOverlay
        call={call}
        muted={muted}
        cameraOff={cameraOff}
        hasCamera={hasCamera}
        elapsed={elapsed}
        notice={notice}
        localStream={localStream}
        remoteStream={remoteStream}
        remoteHasVideo={remoteHasVideo}
        onAccept={(withVideo) => acceptCall(withVideo)}
        onDecline={() => latest.current.hangUp()}
        onHangup={() => latest.current.hangUp()}
        onToggleMute={toggleMute}
        onToggleCamera={toggleCamera}
      />
    </CallContext.Provider>
  );
}

export default CallProvider; 