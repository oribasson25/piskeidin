import json
import anthropic
from pathlib import Path
from typing import List
from fastapi import APIRouter, UploadFile, File
from processors.pdf_processor import extract_pdf_text
from processors.docx_processor import extract_docx_text

router = APIRouter()


def get_client():
    from routers.settings import get_api_key, load_settings
    key   = get_api_key()
    model = load_settings().get("model", "claude-sonnet-4-5")
    return anthropic.Anthropic(api_key=key), model


def build_extraction_prompt(text: str) -> str:
    return f"""אתה מומחה לניתוח פסקי דין בישראל. נתח את פסק הדין הבא וחלץ את המידע המבוקש.

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף, ללא markdown, ללא ```):
{{
  "court": "שם בית המשפט המלא",
  "judge": "שם השופט/ת",
  "case_description": "תיאור קצר של המקרה ב-2-3 משפטים",
  "verdict": "פסק הדין כפי שנכתב, במלל מלא",
  "amount_final": 14586.29
}}

חוקים קפדניים:
- court: שם בית המשפט המלא בדיוק (לדוגמה: "בית משפט השלום תל אביב-יפו")
- judge: שם השופט/ת בלבד, ללא תואר
- case_description: 2-3 משפטים המסכמים את מהות הסכסוך
- verdict: הנוסח המדויק של הפסיקה מהמסמך
- amount_final: הסכום הסופי שעל ליברה לשלם כפי שנפסק (float בלבד, ללא ₪ ללא פסיקים)
- אם ליברה לא נדרשת לשלם — הכנס 0
- אם מידע מסוים לא מופיע בפסק — הכנס null
- אם לא ניתן לקבוע סכום מדויק — הכנס null

===== פסק הדין =====
{text[:50000]}
==================="""


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
        if "```" in text:
            text = text[:text.rfind("```")]
    return json.loads(text.strip())


@router.post("/analyze")
async def analyze(files: List[UploadFile] = File(...)):
    try:
        client, model = get_client()
    except ValueError:
        return {"error": "missing_api_key", "results": []}

    results = []
    for file in files:
        filename = file.filename
        entry = {"filename": filename, "court": None, "judge": None,
                 "case_description": None, "verdict": None,
                 "amount_final": None, "error": None}
        try:
            file_bytes = await file.read()
            ext = Path(filename).suffix.lower()
            if ext == ".pdf":
                text = extract_pdf_text(file_bytes)
            elif ext in (".docx", ".doc"):
                text = extract_docx_text(file_bytes)
            else:
                entry["error"] = f"סוג קובץ לא נתמך: {ext}"
                results.append(entry)
                continue

            prompt = build_extraction_prompt(text)
            message = client.messages.create(
                model=model,
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = message.content[0].text
            data = _parse_json_response(raw)
            entry.update({
                "court":            data.get("court"),
                "judge":            data.get("judge"),
                "case_description": data.get("case_description"),
                "verdict":          data.get("verdict"),
                "amount_final":     data.get("amount_final"),
            })
        except Exception as e:
            entry["error"] = str(e)
        results.append(entry)

    return {"results": results}
