import { useEffect, useRef, useState } from "react";
import StreamingAvatar, {
  AvatarQuality,
  StreamingEvents,
} from "@heygen/streaming-avatar";
import {
  getToken,
  listAvatars,
  createKB,
  chat, // REST chat; we reuse the same sessionId the SDK creates
} from "./api";

export default function RecruiterInterview() {
  const avatarClientRef = useRef(null);
  const videoRef = useRef(null);

  const [avatars, setAvatars] = useState([]);
  const [avatarId, setAvatarId] = useState("");
  const [kbContent, setKbContent] = useState(
`You are an AI recruiter. Use ONLY the facts below to screen candidates.
Keep answers short (1–3 sentences). If info is missing, ask one targeted question.

[ROLE BRIEF]
Data Analyst / Data Engineer (Python, SQL, ETL). Remote-friendly.

[REQUIRED SKILLS]
- 3+ yrs Python
- 2+ yrs SQL & data modeling
- Cloud ETL (GCP/AWS), Git

[SCREENING FLOW]
1) Confirm role & location eligibility.
2) Ask for years with Python and SQL.
3) Ask about a recent ETL project and their role.
4) Availability, notice period, work authorization.
5) Summarize fit + missing info.`
  );
  const [kbId, setKbId] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [token, setToken] = useState("");
  const [messages, setMessages] = useState([]);
  const [userText, setUserText] = useState("");
  const [sdkMode, setSdkMode] = useState(false); // video session active?
  const [voiceOn, setVoiceOn] = useState(false); // voice chat active?

  // Load token + avatars
  useEffect(() => {
    (async () => {
      try {
        const [{ token }, avatarsResp] = await Promise.all([getToken(), listAvatars()]);
        setToken(token);
        const list = avatarsResp?.data || [];
        setAvatars(list);
        if (list.length) setAvatarId(list[0].avatar_id);
      } catch (e) {
        console.error(e);
        alert("Failed to initialize: " + e.message);
      }
    })();
  }, []);

  // Create KB
  const handleCreateKB = async () => {
    try {
      const resp = await createKB("RecruiterKB", kbContent);
      const id = resp?.data?.knowledge_base_id || resp?.data?.id || resp?.knowledge_base_id;
      if (!id) throw new Error("No knowledge_base_id in response");
      setKbId(id);
      alert("✅ Knowledge Base created successfully!");
    } catch (e) {
      console.error(e);
      alert("Create KB failed: " + e.message);
    }
  };

  // Start VIDEO session via SDK; reuse its sessionId for REST chat
  const handleStartSessionForVideo = async () => {
    if (!kbId) return alert("Create a Knowledge Base first");
    if (!avatarId) return alert("Pick an avatar");

    try {
      const client = new StreamingAvatar({ token });

      client.on(StreamingEvents.STREAM_READY, (e) => {
        const stream = e.detail;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(console.error);
        }
      });

      client.on(StreamingEvents.ERROR, (e) => {
        console.error("SDK Error:", e?.detail || e);
      });

      const startInfo = await client.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: avatarId,
        knowledgeId: kbId,
      });

      const sid = startInfo?.sessionId || startInfo?.session_id || startInfo?.data?.session_id;
      if (!sid) throw new Error("No sessionId returned by SDK");
      setSessionId(sid);
      setSdkMode(true);
      avatarClientRef.current = client;

      // Kick-start the convo so it speaks
      const bootText = "Introduce yourself briefly and ask the first screening question based on the knowledge base.";
      setMessages((m) => [...m, { role: "system", text: "Video session started." }]);
      await chat(sid, bootText);
      setMessages((m) => [...m, { role: "user", text: "(auto) " + bootText }]);

    } catch (e) {
      console.error(e);
      alert("Start video session failed: " + e.message);
    }
  };

  // Start TEXT-ONLY session (SDK still creates the session for consistency)
  const handleStartSessionForText = async () => {
    if (!kbId) return alert("Create a Knowledge Base first");
    if (!avatarId) return alert("Pick an avatar");

    try {
      const client = new StreamingAvatar({ token });
      const startInfo = await client.createStartAvatar({
        quality: AvatarQuality.High,
        avatarName: avatarId,
        knowledgeId: kbId,
      });
      const sid = startInfo?.sessionId || startInfo?.session_id || startInfo?.data?.session_id;
      if (!sid) throw new Error("No sessionId returned by SDK");
      setSessionId(sid);
      setSdkMode(false);
      avatarClientRef.current = client;
      setMessages((m) => [...m, { role: "system", text: "Text session started." }]);
    } catch (e) {
      console.error(e);
      alert("Start text session failed: " + e.message);
    }
  };

  // TEXT chat send (works for both modes because we target the same SDK-created session)
  const handleSend = async () => {
    if (!sessionId) return alert("Start a session first");
    if (!userText.trim()) return;

    const text = userText;
    setUserText("");
    setMessages((m) => [...m, { role: "user", text }]);

    try {
      const resp = await chat(sessionId, text);
      const reply = resp?.data?.text || resp?.data?.reply || resp?.message || JSON.stringify(resp);
      setMessages((m) => [...m, { role: "assistant", text: reply }]);
    } catch (e) {
      console.error(e);
      setMessages((m) => [...m, { role: "assistant", text: "Error: " + e.message }]);
    }
  };

  // ====== VOICE CHAT CONTROLS ======

  // Start voice chat (continuous mic)
  const startVoiceChat = async () => {
    if (!avatarClientRef.current || !sessionId) return alert("Start a session first (video or text).");

    try {
      // Optional: pre-prompt browser for mic permission to avoid user gesture race
      await navigator.mediaDevices.getUserMedia({ audio: true });

      // Start HeyGen voice chat: streams your mic to their STT
      await avatarClientRef.current.startVoiceChat({
        // If your use case needs non-English STT, set language here, e.g. "en-US", "en", "fr", etc.
        // language: "en-US",
        useSilencePrompt: true,   // lets the model respond after you stop speaking
        isInputAudioMuted: false, // start unmuted so it hears you immediately
      });

      setVoiceOn(true);
    } catch (e) {
      console.error("startVoiceChat error:", e);
      alert("Could not start voice chat: " + (e.message || e));
    }
  };

  // Stop voice chat
  const stopVoiceChat = async () => {
    if (!avatarClientRef.current) return;
    try {
      await avatarClientRef.current.stopVoiceChat();
    } catch (e) {
      console.warn("stopVoiceChat error:", e);
    } finally {
      setVoiceOn(false);
    }
  };

  const handleUnmuteVideo = () => {
    if (videoRef.current) {
      videoRef.current.muted = false;
      videoRef.current.play().catch(() => {});
    }
  };

  return (
    <div style={{ display: "grid", gap: 16, gridTemplateColumns: "1fr 1fr", padding: 16 }}>
      {/* Left Panel */}
      <div style={{ display: "grid", gap: 12 }}>
        <h2>AI Recruiter — Setup</h2>

        <label>
          Avatar:
          <select value={avatarId} onChange={(e) => setAvatarId(e.target.value)}>
            {avatars.map((a) => (
              <option key={a.avatar_id} value={a.avatar_id}>
                {a.pose_name || a.avatar_id}
              </option>
            ))}
          </select>
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          Knowledge Base Content
          <textarea
            rows={12}
            value={kbContent}
            onChange={(e) => setKbContent(e.target.value)}
            placeholder="Paste job description + resume snippets + screening flow..."
          />
        </label>

        <button onClick={handleCreateKB}>Create Knowledge Base</button>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button onClick={handleStartSessionForVideo}>Start Video Session</button>
          <button onClick={handleStartSessionForText}>Start Text Session</button>
        </div>

        {/* Voice Chat Controls */}
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={startVoiceChat} disabled={!sessionId || voiceOn}>
            🎙️ Start Voice Chat
          </button>
          <button onClick={stopVoiceChat} disabled={!voiceOn}>
            ⏹️ Stop Voice Chat
          </button>
          <span style={{ fontSize: 12, color: "#666" }}>
            Mic: {voiceOn ? "ON" : "OFF"} (allow mic permissions in the browser)
          </span>
        </div>

        {/* Text Chat */}
        <div style={{ display: "grid", gap: 6 }}>
          <h3>Text Chat</h3>
          <div style={{ border: "1px solid #ddd", padding: 8, minHeight: 160, maxHeight: 220, overflowY: "auto" }}>
            {messages.map((m, i) => (
              <div key={i} style={{ marginBottom: 8 }}>
                <strong>{m.role}:</strong> {m.text}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={userText}
              onChange={(e) => setUserText(e.target.value)}
              placeholder="Type your message..."
              style={{ flex: 1 }}
            />
            <button onClick={handleSend}>Send</button>
          </div>
        </div>
      </div>

      {/* Right Panel: Avatar */}
      <div>
        <h2>Avatar</h2>
        <div
          style={{
            width: "100%",
            aspectRatio: "16 / 9",
            borderRadius: 12,
            border: "1px solid #ddd",
            overflow: "hidden",
            background: "#000",
            position: "relative",
          }}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            style={{ width: "100%", height: "100%" }}
          />
          <button
            onClick={handleUnmuteVideo}
            style={{
              position: "absolute",
              bottom: 12,
              left: 12,
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #ccc",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            🔊 Unmute
          </button>
        </div>
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          Session ID: {sessionId || "—"} &nbsp; | KB: {kbId || "—"} &nbsp; | Mode: {sdkMode ? "Video" : (sessionId ? "Text" : "—")}
        </div>
      </div>
    </div>
  );
}
