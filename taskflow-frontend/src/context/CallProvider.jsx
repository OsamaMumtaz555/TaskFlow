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

// Phones and some browsers cannot share a screen
const canShareScreen = Boolean(navigator.mediaDevices?.getDisplayMedia);

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
  //          startedAt, reconnecting, remoteMuted, remoteVideoOff, remoteScreen }   (null = no call)
  const [call, setCall] = useState(null);
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [hasCamera, setHasCamera] = useState(false); // my stream has a video track
  const [sharing, setSharing] = useState(false); // I am sharing my screen
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [remoteHasVideo, setRemoteHasVideo] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [notice, setNotice] = useState("");

  const callRef = useRef(null); // the same call, readable from event handlers
  const pcRef = useRef(null); // the WebRTC connection
  const localStreamRef = useRef(null); // my camera and microphone
  const screenTrackRef = useRef(null); // the track of my shared screen
  const makingOfferRef = useRef(false); // I am in the middle of creating an offer
  const pendingCandidates = useRef([]); // network routes that arrived too early
  const startingRef = useRef(false); // a call is being started (permission prompt open)
  const endNoticeRef = useRef(""); // message to show when I end the call myself because of an error
  const latest = useRef({}); // always the newest version of the functions below

  const updateCall = (next) => {
    callRef.current = next;
    setCall(next);
  };

  // Stops the camera, microphone and screen, closes the connection, stops the ringtone
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

    const screenTrack = screenTrackRef.current;
    if (screenTrack) {
      screenTrack.onended = null;
      screenTrack.stop();
      screenTrackRef.current = null;
    }

    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    pendingCandidates.current = [];
    makingOfferRef.current = false;

    setLocalStream(null);
    setRemoteStream(null);
    setRemoteHasVideo(false);
    setHasCamera(false);
    setSharing(false);
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

    // Everything the other person sends (voice, camera, screen) is collected into ONE stream,
    // so a new screen track never replaces their voice
    const remote = new MediaStream();
    setRemoteStream(remote);

    // every network route my browser finds is passed to the other browser
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal(callId, { candidate: event.candidate.toJSON() });
      }
    };

    pc.ontrack = (event) => {
      if (!remote.getTracks().includes(event.track)) remote.addTrack(event.track);
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

  // Sends a NEW offer in the middle of a call (needed when a new kind of picture must be sent)
  const renegotiate = async (pc, callId) => {
    makingOfferRef.current = true;
    try {
      const offer = await pc.createOffer();
      if (pc.signalingState !== "stable") return; // the other side started first
      await pc.setLocalDescription(offer);
      sendSignal(callId, { description: { type: offer.type, sdp: offer.sdp } });
    } finally {
      makingOfferRef.current = false;
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

  // tells the other person what my microphone / camera / screen are doing
  const sendMedia = (callId, state) => {
    getSocket()?.emit("call:media", { callId, ...state });
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
    sendMedia(current.id, {
      audio: !nextMuted,
      video: hasCamera && !cameraOff,
      screen: sharing,
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
    sendMedia(current.id, { audio: !muted, video: !nextCameraOff, screen: sharing });
  };

  // ---------- screen sharing ----------

  const startScreenShare = async () => {
    const current = callRef.current;
    const pc = pcRef.current;
    if (!current || !pc || current.status !== "active" || screenTrackRef.current) return;

    if (!canShareScreen) {
      setNotice("Screen sharing is not supported in this browser.");
      return;
    }

    // the browser shows its own picker: a tab, a window or the whole screen
    let displayStream;
    try {
      displayStream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: { ideal: 15, max: 30 } },
        audio: false,
      });
    } catch (err) {
      // closing the picker is not an error
      if (err.name !== "NotAllowedError" && err.name !== "AbortError") {
        setNotice("Could not start screen sharing.");
      }
      return;
    }

    const track = displayStream.getVideoTracks()[0];
    if ("contentHint" in track) track.contentHint = "detail"; // keep text sharp

    // the call may have ended while the picker was open
    if (!callRef.current || callRef.current.id !== current.id || !pcRef.current) {
      track.stop();
      return;
    }

    // the browser's own "Stop sharing" bar ends it too
    track.onended = () => latest.current.stopScreenShare();
    screenTrackRef.current = track;

    try {
      const transceiver = pc
        .getTransceivers()
        .find((t) => t.receiver.track.kind === "video");

      if (transceiver) {
        // there is already a video line (my camera, or one I can send on): swap the picture
        await transceiver.sender.replaceTrack(track);
        if (transceiver.direction === "recvonly") {
          // this line could only receive, so the call has to be renegotiated once
          transceiver.direction = "sendrecv";
          await renegotiate(pc, current.id);
        }
      } else {
        // a voice call has no video line yet: add one and renegotiate
        pc.addTrack(track, displayStream);
        await renegotiate(pc, current.id);
      }

      setSharing(true);
      sendMedia(current.id, { audio: !muted, video: false, screen: true });
    } catch (err) {
      console.error("Could not start screen sharing:", err);
      track.onended = null;
      track.stop();
      screenTrackRef.current = null;
      setNotice("Could not start screen sharing.");
    }
  };

  const stopScreenShare = async () => {
    const track = screenTrackRef.current;
    if (!track) return;

    screenTrackRef.current = null;
    track.onended = null;
    track.stop();
    setSharing(false);

    const pc = pcRef.current;
    const current = callRef.current;

    // put my camera back on the line (or nothing, if I have no camera)
    if (pc) {
      const sender = pc.getSenders().find((s) => s.track === track);
      const camera = localStreamRef.current?.getVideoTracks()[0] || null;
      try {
        if (sender) await sender.replaceTrack(camera);
      } catch (err) {
        console.error("Could not restore the camera:", err);
      }
    }

    if (current) {
      sendMedia(current.id, {
        audio: !muted,
        video: hasCamera && !cameraOff,
        screen: false,
      });
    }
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
      await renegotiate(pc, callId); // the first offer
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
          // an offer: the first one of the call, or a renegotiation (for example a shared screen)
          const pc = pcRef.current || createPeer(callId);

          // If both sides sent an offer at the same moment, the caller wins:
          // the callee ("polite") gives up its own offer, the caller ignores the other one
          const polite = current.direction === "incoming";
          const collision = makingOfferRef.current || pc.signalingState !== "stable";
          if (collision && !polite) return;

          await pc.setRemoteDescription(data.description);
          await flushCandidates(pc);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal(callId, { description: { type: answer.type, sdp: answer.sdp } });
        } else if (
          data.description.type === "answer" &&
          pcRef.current?.signalingState === "have-local-offer"
        ) {
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

  // The other person muted / unmuted, turned their camera off / on, or started / stopped sharing
  const onMedia = ({ callId, audio, video, screen }) => {
    const current = callRef.current;
    if (current && current.id === callId) {
      updateCall({
        ...current,
        remoteMuted: !audio,
        remoteVideoOff: !video,
        remoteScreen: Boolean(screen),
      });
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
      stopScreenShare,
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
        sharing={sharing}
        canShare={canShareScreen}
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
        onToggleShare={() => (sharing ? stopScreenShare() : startScreenShare())}
      />
    </CallContext.Provider>
  );
}

export default CallProvider; 