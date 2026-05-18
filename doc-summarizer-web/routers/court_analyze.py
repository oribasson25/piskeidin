import json
import anthropic
from pathlib import Path
from typing import List
from fastapi import APIRouter, UploadFile, File
from processors.pdf_processor import extract_pdf_text
from processors.docx_processor import extract_docx_text

router = APIRouter()


def get_client() -> anthropic.Anthropic:
    from routers.settings import get_api_key
    return anthropic.Anthropic(api_key=get_api_key())


def build_extraction_prompt(text: str) -> str:
    return f"""אתה מומחה לניתוח פסקי דין בישראל. נתח את פסק הדין הבא וחלץ את המידע המבוקש.

החזר תשובה בפורמט JSON בלבד (ללא טקסט נוסף, ללא markdown, ללא ```):
{{
  "court": "שם בית המשפט המלא",
  "judge": "שם השופט/ת",
  "case_description": "תיאור קצר של המקרה ב-2-3 משפטים",
  "verdict": "פסק הדין כפי שנכתב, במלל מלא",
  "amount_before_vat": 12345.67,
  "amount_after_vat": 14586.29
}}

חוקים קפדניים:
- court: שם בית המשפט המלא בדיוק (לדוגמה: "בית משפט השלום תל אביב-יפו")
- judge: שם השופט/ת בלבד, ללא תואר
- case_description: 2-3 משפטים המסכמים את מהות הסכסוך
- verdict: הנוסח המדויק של הפסיקה מהמסמך
- amount_before_vat: המספר שעל ליברה לשלם לפני מע"מ (float בלבד, ללא ₪ ללא פסיקים)
- amount_after_vat: המספר שעל ליברה לשלם אחרי מע"מ (float בלבד, ללא ₪ ללא פסיקים)
- אם ליברה לא נדרשת לשלם — הכנס 0
- אם מידע מסוים לא מופיע בפסק — הכנס null
- אם לא ניתן לקבוע סכום מדויק — הכנס null

===== פסק הדין =====
{text[:50000]}
==================="""


def build_analysis_prompt(cases: list) -> str:
    lines = []
    for i, c in enumerate(cases):
        before = c.get("amount_before_vat")
        after  = c.get("amount_after_vat")
        before_str = f"₪{before:,.0f}" if before is not None else "לא צוין"
        after_str  = f"₪{after:,.0f}"  if after  is not None else "לא צוין"
        lines.append(
            f"פסק {i+1}: {c.get('court','לא ידוע')} | "
            f"שופט/ת: {c.get('judge','לא ידוע')} | "
            f"לפני מע\"מ: {before_str} | "
            f"אחרי מע\"מ: {after_str}"
        )

    return f"""אתה יועץ משפטי המנתח פסקי דין נגד חברת ליברה. בהתבסס על הנתונים הבאים, ספק ניתוח מפורט.

פסקי הדין:
{chr(10).join(lines)}

ספק ניתוח הכולל:
1. אילו בתי משפט פסקו סכומים גבוהים (לא נוחים לליברה)
2. אילו בתי משפט פסקו סכומים נמוכים (נוחים לליברה)
3. תובנות על שופטים ספציפיים אם יש מספיק נתונים
4. המלצה מסכמת: לאיזו ערכאה עדיף להגיע ולאיזו לא

ענה בעברית, בנקודות ברורות ומסודרות."""


def _parse_json_response(text: str) -> dict:
    text = text.strip()
    # Strip markdown code fences if present
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
        client = get_client()
    except ValueError:
        return {"error": "missing_api_key", "results": []}

    results = []
    for file in files:
        filename = file.filename
        entry = {"filename": filename, "court": None, "judge": None,
                 "case_description": None, "verdict": None,
                 "amount_before_vat": None, "amount_after_vat": None, "error": None}
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
                model="claude-opus-4-5",
                max_tokens=2000,
                messages=[{"role": "user", "content": prompt}]
            )
            raw = message.content[0].text
            data = _parse_json_response(raw)
            entry.update({
                "court":             data.get("court"),
                "judge":             data.get("judge"),
                "case_description":  data.get("case_description"),
                "verdict":           data.get("verdict"),
                "amount_before_vat": data.get("amount_before_vat"),
                "amount_after_vat":  data.get("amount_after_vat"),
            })
        except Exception as e:
            entry["error"] = str(e)
        results.append(entry)

    return {"results": results}


@router.post("/analyze/summary")
async def analyze_summary(body: dict):
    cases = body.get("cases", [])
    if not cases:
        return {"summary": "אין נתונים לניתוח."}
    try:
        client = get_client()
    except ValueError:
        return {"error": "missing_api_key", "summary": ""}

    prompt = build_analysis_prompt(cases)
    try:
        message = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=1500,
            messages=[{"role": "user", "content": prompt}]
        )
        return {"summary": message.content[0].text}
    except Exception as e:
        return {"error": str(e), "summary": ""}
