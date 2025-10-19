from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os, requests
from pathlib import Path
from dotenv import load_dotenv

# load .env that sits next to app.py
ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

HEYGEN_API_KEY = os.getenv("HEYGEN_API_KEY")
if not HEYGEN_API_KEY:
    raise RuntimeError(f"HEYGEN_API_KEY not set. Checked {ENV_PATH} (exists={ENV_PATH.exists()})")

app = FastAPI()

# Allow your local frontend; add your prod domain later
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

@app.get("/api/get-access-token")
def get_access_token():
    try:
        r = requests.post(
            "https://api.heygen.com/v1/streaming.create_token",
            headers={"x-api-key": HEYGEN_API_KEY},
            timeout=15,
        )
        r.raise_for_status()
        data = r.json().get("data", {})
        token = data.get("token")
        if not token:
            raise HTTPException(status_code=502, detail="No token returned by HeyGen")
        return {"token": token}
    except requests.RequestException as e:
        raise HTTPException(status_code=502, detail=f"HeyGen API error: {e}")


@app.get("/api/streaming-avatars")
def streaming_avatars():
    import requests, os
    try:
        r = requests.get(
            "https://api.heygen.com/v1/streaming/avatar.list",
            headers={"x-api-key": os.getenv("HEYGEN_API_KEY")},
            timeout=15,
        )
        # If HeyGen sends a non-200 or code != 100, return the raw body for debugging
        r.raise_for_status()
        body = r.json()
        return body  # typically { "code": 100, "data": [ { avatar_id, pose_name, ... }, ... ], "message": "Success" }
    except requests.RequestException as e:
        # Bubble up details so you see what's wrong in the browser console/Network tab
        raise HTTPException(status_code=502, detail=f"HeyGen API error: {e}")

