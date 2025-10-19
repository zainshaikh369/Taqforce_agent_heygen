import { useEffect, useRef, useState } from "react";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
} from "@heygen/streaming-avatar";

export default function App() {
  const videoRef = useRef(null);
  const [avatar, setAvatar] = useState(null);
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState("idle");

  // Avatar list + selection
  const [avatars, setAvatars] = useState([]);      // from /api/streaming-avatars
  const [selected, setSelected] = useState("");    // we store avatar_id here
  const [loadingList, setLoadingList] = useState(true);

  // Text chat
  const [text, setText] = useState("");

  // Mode: "text" or "voice"
  const [mode, setMode] = useState("text");

  async function getAccessToken() {
    const r = await fetch("/api/get-access-token");
    if (!r.ok) throw new Error("Failed to get token");
    const { token } = await r.json();
    return token;
  }

  async function fetchAvatars() {
    setLoadingList(true);
    try {
      const r = await fetch("/api/streaming-avatars");
      if (!r.ok) throw new Error("Failed to fetch avatar list");
      const json = await r.json(); // typically { code, data: [...], message }
      const list = Array.isArray(json?.data) ? json.data : [];
      setAvatars(list);
      // Preselect first avatar_id if available; else keep empty (fallback to default)
      setSelected(list[0]?.avatar_id ?? "");
    } catch (e) {
      console.error(e);
      // If list fails, we'll still allow starting with default avatar
      setAvatars([]);
      setSelected("");
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    fetchAvatars();
  }, []);

  const start = async () => {
    if (avatar) return;
    setStatus("connecting…");
    try {
      const token = await getAccessToken();
      const a = new StreamingAvatar({ token });

      a.on(StreamingEvents.STREAM_READY, (e) => {
        if (videoRef.current) {
          videoRef.current.srcObject = e.detail;
          videoRef.current.onloadedmetadata = () => {
            videoRef.current.play().catch(console.error);
          };
        }
        setConnected(true);
        setStatus(mode === "voice" ? "waiting for you…" : "connected");
      });

      a.on(StreamingEvents.USER_START, () => {
        if (mode === "voice") setStatus("listening…");
      });
      a.on(StreamingEvents.USER_STOP, () => {
        if (mode === "voice") setStatus("processing…");
      });
      a.on(StreamingEvents.AVATAR_START_TALKING, () => {
        setStatus("avatar speaking…");
      });
      a.on(StreamingEvents.AVATAR_STOP_TALKING, () => {
        setStatus(mode === "voice" ? "waiting for you…" : "connected");
      });

      a.on(StreamingEvents.STREAM_DISCONNECTED, () => {
        if (videoRef.current) videoRef.current.srcObject = null;
        setConnected(false);
        setStatus("idle");
        setAvatar(null);
        setMode("text");
      });

      // Start the avatar session.
      // If 'selected' is empty (no list / none chosen), omit avatarName to use default.
      const startPayload = {
        quality: AvatarQuality.High,
        language: "en",
        disableIdleTimeout: true,
        ...(selected ? { avatarName: selected } : {}),
      };
      await a.createStartAvatar(startPayload);

      // If user has pre-chosen voice mode, start listening
      if (mode === "voice") {
        try {
          await a.startVoiceChat({ useSilencePrompt: false });
          setStatus("waiting for you…");
        } catch (err) {
          console.error("Voice chat start failed:", err);
          setMode("text");
          setStatus("connected");
        }
      }

      setAvatar(a);
    } catch (err) {
      console.error(err);
      setStatus("error");
      alert("Could not start avatar. Check token, avatar selection, or console logs.");
    }
  };

  const stop = async () => {
    if (!avatar) return;
    try { await avatar.closeVoiceChat?.(); } catch {}
    await avatar.stopAvatar();
    if (videoRef.current) videoRef.current.srcObject = null;
    setAvatar(null);
    setConnected(false);
    setStatus("idle");
    setMode("text");
  };

  const speak = async () => {
    if (!avatar || !text.trim() || mode !== "text") return;
    await avatar.speak({ text: text.trim() });
    setText("");
  };

  const enableVoice = async () => {
    if (!avatar) {
      setMode("voice"); // will start voice after session connects
      return;
    }
    try {
      await avatar.startVoiceChat({ useSilencePrompt: false });
      setMode("voice");
      setStatus("waiting for you…");
    } catch (e) {
      console.error(e);
      setStatus("voice error");
    }
  };

  const disableVoice = async () => {
    if (!avatar) {
      setMode("text");
      return;
    }
    try { await avatar.closeVoiceChat(); } catch {}
    setMode("text");
    setStatus("connected");
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (avatar) {
        try { avatar.closeVoiceChat?.(); } catch {}
        try { avatar.stopAvatar(); } catch {}
      }
    };
  }, [avatar]);

  return (
    <div style={{ padding: 24, maxWidth: 900, margin: "0 auto" }}>
      <h2>HeyGen Streaming Avatar — Runtime Picker</h2>
      <p>Status: {status}</p>

      {/* Controls row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center", marginBottom: 12 }}>
        {/* Avatar dropdown */}
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={connected || loadingList}
          style={{ padding: 10, borderRadius: 8 }}
        >
          {loadingList && <option>Loading avatars…</option>}
          {!loadingList && avatars.length === 0 && (
            <option value="">(No list returned — will use default)</option>
          )}
          {!loadingList &&
            avatars.map((av) => (
              <option key={av.avatar_id} value={av.avatar_id}>
                {av.pose_name || av.avatar_id}
              </option>
            ))}
        </select>

        <button onClick={fetchAvatars} disabled={connected || loadingList}>Refresh</button>

        {!connected ? (
          <button onClick={start}>Start</button>
        ) : (
          <button onClick={stop}>Stop</button>
        )}

        {mode === "voice" ? (
          <button onClick={disableVoice} disabled={!connected}>Voice → Text</button>
        ) : (
          <button onClick={enableVoice} disabled={!connected && !!avatar}>
            Text → Voice
          </button>
        )}
      </div>

      {/* Video */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{ width: "100%", borderRadius: 12, background: "#000" }}
      />

      {/* Text mode input */}
      {mode === "text" && (
        <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={connected ? "Type something for the avatar to say…" : "Start the session first"}
            style={{ flex: 1, padding: 10, borderRadius: 10 }}
          />
          <button onClick={speak} disabled={!connected}>Speak</button>
        </div>
      )}

      <small style={{ display: "block", marginTop: 12 }}>
        Tip: If the list is empty, the session uses HeyGen’s default avatar. Use headphones in voice mode to avoid echo.
      </small>
    </div>
  );
}
