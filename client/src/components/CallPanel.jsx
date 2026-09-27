import { useEffect, useRef, useState } from "react";
import { getSocket } from "../socket.js";

const ICE_SERVERS = [{ urls: "stun:stun.l.google.com:19302" }];

export default function CallPanel({ call, me, onClose }) {
  const { roomId, kind, label } = call;
  const [participants, setParticipants] = useState([]); // {userId, username, stream}
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(kind === "video");
  const [error, setError] = useState(null);
  const localVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const peersRef = useRef(new Map()); // userId -> RTCPeerConnection

  useEffect(() => {
    const socket = getSocket();
    let cancelled = false;

    async function start() {
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: kind === "video",
        });
      } catch {
        if (!cancelled) setError("Não foi possível acessar o microfone/câmera. Verifique as permissões do navegador.");
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      localStreamRef.current = stream;
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;

      function makePeer(userId, username) {
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit("call:signal", {
              roomId,
              toUserId: userId,
              data: { type: "candidate", candidate: e.candidate },
            });
          }
        };

        pc.ontrack = (e) => {
          setParticipants((prev) =>
            prev.map((p) => (p.userId === userId ? { ...p, stream: e.streams[0] } : p))
          );
        };

        peersRef.current.set(userId, pc);
        return pc;
      }

      async function callUser(userId, username) {
        const pc = makePeer(userId, username);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit("call:signal", {
          roomId,
          toUserId: userId,
          data: { type: "offer", sdp: offer },
        });
      }

      socket.on("call:participants", ({ roomId: rid, participants: existing }) => {
        if (rid !== roomId) return;
        setParticipants(existing.map((p) => ({ ...p, stream: null })));
        existing.forEach((p) => callUser(p.userId, p.username));
      });

      socket.on("call:peer-joined", ({ roomId: rid, userId, username }) => {
        if (rid !== roomId) return;
        setParticipants((prev) => [...prev, { userId, username, stream: null }]);
      });

      socket.on("call:peer-left", ({ roomId: rid, userId }) => {
        if (rid !== roomId) return;
        peersRef.current.get(userId)?.close();
        peersRef.current.delete(userId);
        setParticipants((prev) => prev.filter((p) => p.userId !== userId));
      });

      socket.on("call:signal", async ({ roomId: rid, fromUserId, data }) => {
        if (rid !== roomId) return;
        let pc = peersRef.current.get(fromUserId);
        if (data.type === "offer") {
          if (!pc) pc = makePeer(fromUserId, "");
          await pc.setRemoteDescription(data.sdp);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit("call:signal", {
            roomId,
            toUserId: fromUserId,
            data: { type: "answer", sdp: answer },
          });
        } else if (data.type === "answer") {
          await pc?.setRemoteDescription(data.sdp);
        } else if (data.type === "candidate") {
          try {
            await pc?.addIceCandidate(data.candidate);
          } catch {
            // ignore
          }
        }
      });

      socket.emit("call:join", { roomId });
    }

    start();

    return () => {
      cancelled = true;
      socket.off("call:participants");
      socket.off("call:peer-joined");
      socket.off("call:peer-left");
      socket.off("call:signal");
      socket.emit("call:leave", { roomId });
      for (const pc of peersRef.current.values()) pc.close();
      peersRef.current.clear();
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [roomId, kind]);

  function toggleMic() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = !micOn));
    setMicOn(!micOn);
  }

  function toggleCam() {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = !camOn));
    setCamOn(!camOn);
  }

  if (error) {
    return (
      <div className="call-overlay">
        <div className="call-header">Chamada — {label}</div>
        <div className="call-error">{error}</div>
        <div className="call-controls">
          <button className="hangup" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="call-overlay">
      <div className="call-header">Chamada — {label}</div>
      <div className="call-grid">
        <div className="call-tile">
          <video ref={localVideoRef} autoPlay muted playsInline className={kind === "video" ? "" : "audio-only"} />
          <span className="call-tile-name">Você</span>
        </div>
        {participants.map((p) => (
          <ParticipantTile key={p.userId} participant={p} videoCall={kind === "video"} />
        ))}
      </div>
      <div className="call-controls">
        <button className={micOn ? "" : "off"} onClick={toggleMic}>
          {micOn ? "🎤" : "🔇"}
        </button>
        {kind === "video" && (
          <button className={camOn ? "" : "off"} onClick={toggleCam}>
            {camOn ? "📷" : "📷🚫"}
          </button>
        )}
        <button className="hangup" onClick={onClose}>
          Encerrar
        </button>
      </div>
    </div>
  );
}

function ParticipantTile({ participant, videoCall }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = participant.stream;
  }, [participant.stream]);
  return (
    <div className="call-tile">
      <video ref={ref} autoPlay playsInline className={videoCall ? "" : "audio-only"} />
      <span className="call-tile-name">{participant.username || "..."}</span>
    </div>
  );
}
