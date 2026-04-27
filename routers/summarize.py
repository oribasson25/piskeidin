import json
import yaml
import anthropic
from pathlib import Path
from typing import List
from fastapi import APIRouter, UploadFile, File, Form
from processors.pdf_processor import extract_pdf_text
from processors.docx_processor import extract_docx_text

router = APIRouter()

CONFIG_FILE = Path(__file__).parent.parent / "config.yaml"


def load_config() -> dict:
    return yaml.safe_load(CONFIG_FILE.read_text(encoding="utf-8"))


def get_client() -> anthropic.Anthropic:
    from routers.settings import get_api_key
    return anthropic.Anthropic(api_key=get_api_key())


def build_prompt(config: dict, text: str) -> str:
    params = config["summarization"]
    instructions = "\n".join(f"  • {p}" for p in params["parameters"])
    fmt = "נקודות (bullet points)" if params["output_format"] == "bullet_points" else "פסקה רציפה"
    return f"""אתה מומחה לסיכום מסמכים. סכם את המסמך הבא לפי ההנחיות בלבד.

הנחיות:
{instructions}

פורמט: {fmt}
שפה: {params['language']}
אורך מקסימלי: {params['max_length']} מילים

השב אך ורק עם הסיכום, ללא הקדמות.

===== מסמך =====
{text[:50000]}
================="""


@router.post("/summarize")
async def summarize(
    files: List[UploadFile] = File(...),
    config_override: str = Form(None)
):
    try:
        client = get_client()
    except ValueError:
        return {"error": "missing_api_key", "results": []}

    config = load_config()
    if config_override:
        override = json.loads(config_override)
        config["summarization"].update(override)

    model = config["summarization"].get("model", "claude-opus-4-5")

    results = []
    for file in files:
        filename = file.filename
        try:
            file_bytes = await file.read()
            ext = Path(filename).suffix.lower()

            if ext == ".pdf":
                text = extract_pdf_text(file_bytes)
            elif ext in (".docx", ".doc"):
                text = extract_docx_text(file_bytes)
            else:
                results.append({
                    "filename": filename,
                    "summary": None,
                    "char_count": 0,
                    "truncated": False,
                    "error": f"סוג קובץ לא נתמך: {ext}"
                })
                continue

            char_count = len(text)
            truncated = char_count > 50000
            prompt = build_prompt(config, text)

            message = client.messages.create(
                model=model,
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}]
            )
            summary = message.content[0].text

            results.append({
                "filename": filename,
                "summary": summary,
                "char_count": char_count,
                "truncated": truncated,
                "error": None
            })
        except Exception as e:
            results.append({
                "filename": filename,
                "summary": None,
                "char_count": 0,
                "truncated": False,
                "error": str(e)
            })

    return {"results": results}
