import json
import os
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

SETTINGS_FILE = Path("settings.json")


def load_settings() -> dict:
    if SETTINGS_FILE.exists():
        return json.loads(SETTINGS_FILE.read_text())
    return {}


def save_settings_file(data: dict):
    try:
        SETTINGS_FILE.write_text(json.dumps(data, indent=2))
    except OSError:
        pass  # ephemeral filesystem on serverless


def get_api_key() -> str:
    # Vercel / production: ANTHROPIC_API_KEY environment variable
    env_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if env_key:
        return env_key
    # Local development: settings.json
    key = load_settings().get("api_key", "")
    if not key:
        raise ValueError("לא הוגדר API Key. פתח את ההגדרות והזן מפתח.")
    return key


@router.get("/settings")
async def get_settings():
    env_key  = os.environ.get("ANTHROPIC_API_KEY", "")
    file_key = load_settings().get("api_key", "")
    key      = env_key or file_key
    s        = load_settings()
    return {
        "has_api_key":  bool(key),
        "api_key_hint": f"...{key[-4:]}" if len(key) >= 4 else "",
        "model":        s.get("model", "claude-opus-4-5"),
        "from_env":     bool(env_key),
    }


@router.put("/settings")
async def save_settings(body: dict):
    s = load_settings()
    if body.get("api_key"):
        s["api_key"] = body["api_key"]
    if body.get("model"):
        s["model"] = body["model"]
    save_settings_file(s)
    return {"ok": True}
