const BASE = ""; // same origin; set to "http://localhost:8000" if serving separately

export async function getToken() {
  const r = await fetch(`${BASE}/api/get-access-token`);
  if (!r.ok) throw new Error("Failed to get token");
  return r.json();
}

export async function listAvatars() {
  const r = await fetch(`${BASE}/api/streaming-avatars`);
  if (!r.ok) throw new Error("Failed to list avatars");
  return r.json();
}

export async function createKB(name, content) {
  const r = await fetch(`${BASE}/api/create-knowledge-base`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
  });

  const raw = await r.text(); // read raw so we can parse/show details on error

  if (!r.ok) {
    let details = raw;
    try { details = JSON.parse(raw); } catch (_) {}
    // Surface upstream_status/upstream_body if backend provided them
    throw new Error(
      `Create KB failed: ${
        typeof details === "string" ? details : JSON.stringify(details)
      }`
    );
  }

  return JSON.parse(raw);
}

export async function startSession(avatar_id, knowledge_base_id) {
  const r = await fetch(`${BASE}/api/start-session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ avatar_id, knowledge_base_id }),
  });
  if (!r.ok) throw new Error(`Failed to start session: ${await r.text()}`);
  return r.json();
}

export async function chat(session_id, text) {
  const r = await fetch(`${BASE}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, text, task_type: "chat" }),
  });
  if (!r.ok) throw new Error(`Chat failed: ${await r.text()}`);
  return r.json();
}
