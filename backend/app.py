from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import os, requests, json
from pathlib import Path
from dotenv import load_dotenv

# --- Load env next to app.py ---
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")
if not HEYGEN_API_KEY:
    raise RuntimeError(f"HEYGEN_API_KEY not set. Checked {ENV_PATH} (exists={ENV_PATH.exists()})")

app = FastAPI()

# --- CORS (adjust for prod domain) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

# ---------- Models ----------
class KBCreate(BaseModel):
    name: str = "RecruiterKB"
    content: str  # the KB / prompt text

class StartSession(BaseModel):
    avatar_id: str
    knowledge_base_id: str
    quality: str = "high"
    version: str = "v2"

class ChatTask(BaseModel):
    session_id: str
    text: str
    task_type: str = "chat"

# ---------- Token + Avatars ----------
@app.get("/api/get-access-token")
def get_access_token():
    try:
        r = requests.post(
            "https://api.heygen.com/v1/streaming.create_token",
            headers={"x-api-key": HEYGEN_API_KEY},
            timeout=15,
        )
        r.raise_for_status()
        token = r.json().get("data", {}).get("token")
        if not token:
            raise HTTPException(status_code=502, detail="No token returned by HeyGen")
        return {"token": token}
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"HeyGen API error: {e}")

@app.get("/api/streaming-avatars")
def streaming_avatars():
    try:
        r = requests.get(
            "https://api.heygen.com/v1/streaming/avatar.list",
            headers={"x-api-key": HEYGEN_API_KEY},
            timeout=15,
        )
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"HeyGen API error: {e}")

# ---------- Knowledge Base (uses 'prompt' + 'opening') ----------
@app.post("/api/create-knowledge-base")
def create_knowledge_base(payload: KBCreate):
    body = {
        "name": payload.name,
        "opening": "Hi! I’m your AI recruiter. I’ll ask a few short questions about your experience.",
        "prompt": payload.content,  # <-- correct field
    }

    try:
        res = requests.post(
            "https://api.heygen.com/v1/streaming/knowledge_base/create",
            headers={"x-api-key": HEYGEN_API_KEY, "Content-Type": "application/json"},
            json=body,
            timeout=30,
        )

        if res.status_code >= 400:
            # Log upstream details to server console
            try:
                upstream_json = res.json()
                print("[HeyGen KB ERROR]", res.status_code, json.dumps(upstream_json, indent=2))
            except Exception:
                upstream_json = {"raw_body": res.text}
                print("[HeyGen KB ERROR RAW]", res.status_code, res.text)

            # Return detailed error to frontend (wrapped as 502)
            return JSONResponse(
                status_code=502,
                content={
                    "message": "HeyGen KB creation failed",
                    "upstream_status": res.status_code,
                    "upstream_body": upstream_json,
                    "sent_body_preview": {
                        "name": body["name"],
                        "opening": body["opening"],
                        "prompt_len": len(body["prompt"]),
                    },
                },
            )

        return res.json()

    except requests.RequestException as e:
        print("[HeyGen KB REQUEST EXCEPTION]", str(e))
        raise HTTPException(status_code=502, detail=f"HeyGen API error: {e}")

# ---------- Session + Chat ----------
@app.post("/api/start-session")
def start_session(payload: StartSession):
    try:
        res = requests.post(
            "https://api.heygen.com/v1/streaming.new",
            headers={"x-api-key": HEYGEN_API_KEY, "Content-Type": "application/json"},
            json={
                "version": payload.version,
                "avatar_id": payload.avatar_id,
                "knowledge_base_id": payload.knowledge_base_id,
                "quality": payload.quality,
            },
            timeout=20,
        )
        res.raise_for_status()
        return res.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"HeyGen API error: {e}")

@app.post("/api/chat")
def chat(payload: ChatTask):
    try:
        res = requests.post(
            "https://api.heygen.com/v1/streaming.task",
            headers={"x-api-key": HEYGEN_API_KEY, "Content-Type": "application/json"},
            json={
                "session_id": payload.session_id,
                "text": payload.text,
                "task_type": payload.task_type,
            },
            timeout=20,
        )
        res.raise_for_status()
        return res.json()
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"HeyGen API error: {e}")

# ---------- Debug helpers ----------
@app.get("/api/heygen/list-kbs")
def heygen_list_kbs():
    try:
        r = requests.get(
            "https://api.heygen.com/v1/streaming/knowledge_base/list",
            headers={"x-api-key": HEYGEN_API_KEY},
            timeout=20,
        )
        r.raise_for_status()
        return r.json()
    except requests.RequestException as e:
        print("[HeyGen LIST KBs ERROR]", str(e))
        raise HTTPException(status_code=502, detail=f"HeyGen API error: {e}")

@app.get("/api/heygen/whoami")
def heygen_whoami():
    # HeyGen does not expose /v1/user/info; keep this as a harmless stub.
    return {"message": "whoami not supported by HeyGen API"}
