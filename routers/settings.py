import json
from pathlib import Path
from fastapi import APIRouter

router = APIRouter()

SETTINGS_FILE = Path("settings.json")


def load_settings() -> dict:
    if SETTINGS_FILE.exists():
        return json.loads(SETTINGS_FILE.read_text())
    return {}


def save_settings_file(data: dict):
    SETTINGS_FILE.write_text(json.dumps(data, indent=2))


def get_api_key() -> str:
    key = load_settings().get("api_key", "")
    if not key:
        raise ValueError("לא הוגדר API Key. פתח את ההגדרות והזן מפתח.")
    return key


@router.get("/settings")
async def get_settings():
    s = load_settings()
    key = s.get("api_key", "")
    return {
        "has_api_key": bool(key),
        "api_key_hint": f"...{key[-4:]}" if len(key) >= 4 else "",
        "model": s.get("model", "claude-opus-4-5")
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
