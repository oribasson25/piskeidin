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


def _instructions_block(params: dict) -> str:
    n = len(params["parameters"])
    lines = "\n".join(f"{i+1}. {p}" for i, p in enumerate(params["parameters"]))
    return n, lines


def build_prompt(config: dict, text: str) -> str:
    params = config["summarization"]
    n, instructions = _instructions_block(params)
    return f"""אתה מומחה לסיכום מסמכים. קרא את המסמך וענה בדיוק {n} נקודות — נקודה אחת לכל הנחיה.

הנחיות (כל הנחיה = שורה אחת בפלט):
{instructions}

כללי פורמט מחייבים:
- החזר בדיוק {n} שורות
- כל שורה מתחילה ב-• ואחריה תשובה קצרה לאותה הנחיה
- שורה אחת בלבד לכל הנחיה — ללא שורות נוספות, ללא כותרות, ללא הקדמות
- שפה: {params['language']}
- אם מידע לא קיים במסמך, כתוב "לא צוין"

===== מסמך =====
{text[:50000]}
================="""


def build_combined_prompt(config: dict, docs: list) -> str:
    params = config["summarization"]
    n, instructions = _instructions_block(params)
    docs_section = "\n\n".join(
        f"===== מסמך {i + 1}: {name} =====\n{text}\n=================="
        for i, (name, text) in enumerate(docs)
    )
    return f"""אתה מומחה לסיכום מסמכים. קרא את כל המסמכים וענה בדיוק {n} נקודות משולבות — נקודה אחת לכל הנחיה.

הנחיות (כל הנחיה = שורה אחת בפלט):
{instructions}

כללי פורמט מחייבים:
- החזר בדיוק {n} שורות
- כל שורה מתחילה ב-• ואחריה תשובה קצרה לאותה הנחיה, המשלבת מידע מכל המסמכים
- שורה אחת בלבד לכל הנחיה — ללא שורות נוספות, ללא כותרות, ללא הקדמות
- שפה: {params['language']}
- אם מידע לא קיים, כתוב "לא צוין"

{docs_section}"""


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

    # Step 1 — extract text from every file
    ok_docs = []   # (filename, text, char_count)
    failed = []    # (filename, error_msg)

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
                failed.append((filename, f"סוג קובץ לא נתמך: {ext}"))
                continue
            ok_docs.append((filename, text, len(text)))
        except Exception as e:
            failed.append((filename, str(e)))

    results = []

    # Step 2 — one Claude call for all successful docs
    if ok_docs:
        if len(ok_docs) == 1:
            fn, text, cc = ok_docs[0]
            prompt = build_prompt(config, text)
            res_filename = fn
            res_charcount = cc
            res_truncated = cc > 50000
        else:
            per_limit = 50000 // len(ok_docs)
            res_filename = " · ".join(fn for fn, _, _ in ok_docs)
            res_charcount = sum(cc for _, _, cc in ok_docs)
            res_truncated = any(cc > per_limit for _, _, cc in ok_docs)
            prompt = build_combined_prompt(
                config,
                [(fn, text[:per_limit]) for fn, text, _ in ok_docs]
            )

        try:
            message = client.messages.create(
                model=model,
                max_tokens=1500,
                messages=[{"role": "user", "content": prompt}]
            )
            results.append({
                "filename": res_filename,
                "summary": message.content[0].text,
                "char_count": res_charcount,
                "truncated": res_truncated,
                "error": None
            })
        except Exception as e:
            results.append({
                "filename": res_filename,
                "summary": None,
                "char_count": 0,
                "truncated": False,
                "error": str(e)
            })

    # Step 3 — append extraction errors
    for fn, err in failed:
        results.append({
            "filename": fn,
            "summary": None,
            "char_count": 0,
            "truncated": False,
            "error": err
        })

    return {"results": results}
