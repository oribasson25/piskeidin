# Document Summarizer — Web App
## הוראות לבנייה מלאה עבור Claude Code

---

## מה לבנות

אפליקציית Web מקומית (localhost) לסיכום מסמכים PDF ו-DOCX באמצעות Claude API.
המשתמש מעלה קבצים דרך הדפדפן, מגדיר פרמטרים, מקבל סיכומים, ויכול לייצא ל-PDF או Word.

---

## טכנולוגיות

| שכבה | טכנולוגיה |
|------|-----------|
| Backend | Python 3.9+ + FastAPI + Uvicorn |
| Frontend | HTML5 + CSS3 + Vanilla JS (ללא framework) |
| קריאת PDF | PyMuPDF (fitz) |
| קריאת DOCX | python-docx |
| ייצוא PDF | ReportLab |
| ייצוא DOCX | python-docx |
| AI | Anthropic Python SDK |
| הגדרות | PyYAML |

---

## מבנה הפרויקט שיש לצור

```
doc-summarizer-web/
├── CLAUDE.md
├── config.yaml
├── settings.json          ← נוצר אוטומטית, מכיל api_key + model (לא נשלח לדפדפן)
├── requirements.txt
├── main.py
├── routers/
│   ├── __init__.py
│   ├── summarize.py
│   ├── export.py
│   └── settings.py        ← GET/PUT להגדרות המערכת
├── processors/
│   ├── __init__.py
│   ├── pdf_processor.py
│   └── docx_processor.py
├── exporters/
│   ├── __init__.py
│   ├── pdf_exporter.py
│   └── docx_exporter.py
└── static/
    ├── index.html
    ├── style.css
    └── app.js
```

---

## קובץ config.yaml

```yaml
summarization:
  language: "עברית"
  parameters:
    - "סכם את הנקודות העיקריות ב-4 עד 6 נקודות"
    - "ציין תאריכים וחתימות חשובים אם קיימים"
    - "ציין פעולות נדרשות או החלטות שיש לקבל"
    - "ציין את הגורמים המעורבים (אנשים / חברות / גופים)"
  output_format: "bullet_points"   # bullet_points | paragraph
  max_length: 400
  model: "claude-opus-4-5"
```

---

## requirements.txt

```
fastapi>=0.110.0
uvicorn[standard]>=0.29.0
python-multipart>=0.0.9
anthropic>=0.25.0
pymupdf>=1.24.0
python-docx>=1.1.0
reportlab>=4.1.0
pyyaml>=6.0
```

---

## main.py

- צור FastAPI app
- הגשת static files מתיקיית `static/` על `/`
- include את שני הראוטרים: `summarize` ו-`export`
- הרצה: `uvicorn main:app --reload --port 8000`

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from routers import summarize, export, settings

app = FastAPI(title="Document Summarizer")
app.include_router(settings.router)
app.include_router(summarize.router)
app.include_router(export.router)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
```

---

## routers/summarize.py

### Endpoint: POST /summarize

- מקבל: `files: List[UploadFile]` (PDF ו/או DOCX)
- לכל קובץ:
  1. קורא את config.yaml
  2. קורא את ה-API Key מ-`settings.json` דרך `get_api_key()` — אם חסר, מחזיר שגיאה ברורה
  3. חולץ טקסט בהתאם לסוג הקובץ (pdf_processor / docx_processor)
  3. קוטע ל-50,000 תווים אם צריך
  4. שולח ל-Claude עם הנחיות מה-config
  5. מחזיר JSON
- מחזיר:
```json
{
  "results": [
    {
      "filename": "חוזה.pdf",
      "summary": "• נקודה ראשונה\n• נקודה שנייה...",
      "char_count": 12400,
      "truncated": false,
      "error": null
    }
  ]
}
```
- אם קובץ נכשל — `error` מכיל את השגיאה, `summary` יהיה null, ממשיך לקובץ הבא

### בניית ה-Prompt ל-Claude

```python
def build_prompt(config, text):
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

# יצירת client עם המפתח מה-settings.json
def get_client():
    from routers.settings import get_api_key
    return anthropic.Anthropic(api_key=get_api_key())
```

---

## routers/export.py

### Endpoint: POST /export/pdf

- מקבל JSON: `{ "filename": "חוזה.pdf", "summary": "..." }`
- מפיק קובץ PDF עם הסיכום (RTL, גופן תומך עברית)
- מחזיר `FileResponse` עם שם `{filename}_summary.pdf`

### Endpoint: POST /export/docx

- מקבל JSON: `{ "filename": "חוזה.pdf", "summary": "..." }`
- מפיק קובץ DOCX עם הסיכום (RTL, עברית)
- מחזיר `FileResponse` עם שם `{filename}_summary.docx`

---

## routers/settings.py

### אחסון ה-API Key

המפתח נשמר ב-`settings.json` בשורש הפרויקט — **לא** ב-config.yaml ו**לא** כ-env variable.

```json
{
  "api_key": "sk-ant-...",
  "model": "claude-opus-4-5"
}
```

### Endpoint: GET /settings

- מחזיר את הגדרות המערכת **ללא ה-api_key המלא**
- מציג רק האם מפתח מוגדר, ו-4 התווים האחרונים שלו (לאישור)

```python
@router.get("/settings")
async def get_settings():
    s = load_settings()  # קורא settings.json, ברירת מחדל {} אם לא קיים
    key = s.get("api_key", "")
    return {
        "has_api_key": bool(key),
        "api_key_hint": f"...{key[-4:]}" if len(key) >= 4 else "",
        "model": s.get("model", "claude-opus-4-5")
    }
```

### Endpoint: PUT /settings

- מקבל JSON: `{ "api_key": "sk-ant-...", "model": "claude-opus-4-5" }`
- שומר ל-`settings.json`
- אם api_key ריק — לא מחליף את הקיים

```python
@router.put("/settings")
async def save_settings(body: dict):
    s = load_settings()
    if body.get("api_key"):
        s["api_key"] = body["api_key"]
    if body.get("model"):
        s["model"] = body["model"]
    save_settings_file(s)
    return {"ok": True}
```

### פונקציות עזר

```python
import json
from pathlib import Path

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
```

```python
import fitz
from pathlib import Path

def extract_pdf_text(file_bytes: bytes) -> str:
    doc = fitz.open(stream=file_bytes, filetype="pdf")
    pages = []
    for i, page in enumerate(doc, 1):
        text = page.get_text("text").strip()
        if text:
            pages.append(f"[עמוד {i}]\n{text}")
    doc.close()
    if not pages:
        raise ValueError("לא נמצא טקסט בקובץ. ייתכן שהוא סרוק ואינו ניתן לעיבוד.")
    return "\n\n".join(pages)
```

---

## processors/docx_processor.py

```python
from docx import Document
import io

def extract_docx_text(file_bytes: bytes) -> str:
    doc = Document(io.BytesIO(file_bytes))
    parts = []
    for para in doc.paragraphs:
        if para.text.strip():
            parts.append(para.text.strip())
    for table in doc.tables:
        for row in table.rows:
            row_text = " | ".join(c.text.strip() for c in row.cells if c.text.strip())
            if row_text:
                parts.append(row_text)
    if not parts:
        raise ValueError("לא נמצא טקסט בקובץ.")
    return "\n".join(parts)
```

---

## exporters/pdf_exporter.py

- השתמש ב-ReportLab
- הגדר RTL ועברית — השתמש בגופן **DejaVuSans** (כלול ב-ReportLab) שתומך ב-Unicode
- מבנה ה-PDF:
  - כותרת: שם הקובץ המקורי
  - קו מפריד
  - תוכן: הסיכום (שמור על ירידות שורה)
  - תאריך הפקה בתחתית
- מחזיר `bytes` של ה-PDF

```python
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import io, datetime

def export_to_pdf(filename: str, summary: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4, rightMargin=50, leftMargin=50,
                            topMargin=60, bottomMargin=60)
    styles = getSampleStyleSheet()
    rtl_style = ParagraphStyle("RTL", parent=styles["Normal"],
                               alignment=TA_RIGHT, fontSize=12, leading=20)
    title_style = ParagraphStyle("Title", parent=styles["Heading1"],
                                 alignment=TA_RIGHT, fontSize=16)
    story = [
        Paragraph(filename, title_style),
        Spacer(1, 12),
        Paragraph(f"סיכום — {datetime.date.today()}", rtl_style),
        Spacer(1, 20),
    ]
    for line in summary.split("\n"):
        if line.strip():
            story.append(Paragraph(line.strip(), rtl_style))
            story.append(Spacer(1, 6))
    doc.build(story)
    return buffer.getvalue()
```

---

## exporters/docx_exporter.py

- צור DOCX עם python-docx
- כותרת: שם הקובץ המקורי
- כל שורת סיכום = פסקה נפרדת
- יישור RTL לכל הפסקאות
- מחזיר `bytes`

```python
from docx import Document
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import io, datetime

def set_rtl(paragraph):
    pPr = paragraph._p.get_or_add_pPr()
    bidi = OxmlElement("w:bidi")
    pPr.insert(0, bidi)

def export_to_docx(filename: str, summary: str) -> bytes:
    doc = Document()
    title = doc.add_heading(filename, level=1)
    set_rtl(title)
    sub = doc.add_paragraph(f"סיכום — {datetime.date.today()}")
    set_rtl(sub)
    doc.add_paragraph("")
    for line in summary.split("\n"):
        if line.strip():
            p = doc.add_paragraph(line.strip())
            set_rtl(p)
    buffer = io.BytesIO()
    doc.save(buffer)
    return buffer.getvalue()
```

---

## static/index.html — מבנה הממשק

```
┌───────────────────────────────────────────────┐
│  📄 Document Summarizer            [⚙ הגדרות] │  ← כפתור פותח פאנל הגדרות
├───────────────────────────────────────────────┤
│                                               │
│  ┌── פאנל הגדרות (נסגר כברירת מחדל) ────────┐ │
│  │  Claude API Key:                          │ │
│  │  [sk-ant-••••••••••••••••••••••••] [שמור] │ │
│  │  מודל: [claude-opus-4-5 ▼]               │ │
│  │  סטטוס: ✓ מפתח מוגדר (...ab3f)           │ │
│  └───────────────────────────────────────────┘ │
│                                               │
│  [גרור קבצים לכאן]                           │
│  [או לחץ לבחירת קבצים]                       │
│  תמיכה: PDF, DOCX                            │
│                                               │
│  ┌─────────────────────────────────────────┐ │
│  │ פרמטרי סיכום                            │ │
│  │ שפה: [עברית ▼]  פורמט: [נקודות ▼]       │ │
│  │ אורך מקסימלי: [400 מילים]               │ │
│  │                                         │ │
│  │ הנחיות:                                 │ │
│  │ • [סכם את הנקודות העיקריות...      ] ✕  │ │
│  │ • [ציין תאריכים...               ] ✕  │ │
│  │ [+ הוסף הנחיה]                          │ │
│  └─────────────────────────────────────────┘ │
│                                               │
│  [▶ סכם מסמכים]                              │
│                                               │
├───────────────────────────────────────────────┤
│  תוצאות:                                      │
│                                               │
│  📄 חוזה.pdf              [⬇ PDF] [⬇ Word]   │
│  ─────────────────────────────────────────    │
│  • נקודה ראשונה...                            │
│  • נקודה שנייה...                             │
└───────────────────────────────────────────────┘
```

### התנהגות פאנל ההגדרות
- כפתור ⚙ בפינה — פותח/סוגר את הפאנל
- שדה ה-API Key: סוג `password` (מוסתר), עם כפתור "הצג/הסתר"
- בטעינה: קורא GET /settings ומציג סטטוס (✓ מוגדר / ✗ חסר)
- שמירה: PUT /settings — מציג "נשמר ✓" לשתי שניות
- אם אין מפתח ולחצו על "סכם" — מציג הודעה "יש להגדיר API Key בהגדרות" ופותח את הפאנל אוטומטית

---

## static/app.js — לוגיקה

### אתחול
```javascript
// בטעינת הדף — בדוק סטטוס API Key
async function checkSettings() {
  const res = await fetch("/settings");
  const data = await res.json();
  if (!data.has_api_key) {
    openSettingsPanel();  // פתח אוטומטית אם אין מפתח
    showBanner("יש להגדיר API Key לפני השימוש", "warning");
  } else {
    showKeyStatus(`✓ מפתח מוגדר (${data.api_key_hint})`);
  }
}
```

### שמירת הגדרות
```javascript
async function saveSettings() {
  const key = document.getElementById("apiKeyInput").value.trim();
  const model = document.getElementById("modelSelect").value;
  await fetch("/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: key, model })
  });
  showKeyStatus("נשמר ✓");
  setTimeout(checkSettings, 500);  // רענן סטטוס
}
```

### העלאת קבצים
- תמיכה ב-Drag & Drop ובלחיצה לבחירה
- הצג את שמות הקבצים שנבחרו לפני שליחה
- אפשר הסרת קובץ בודד לפני שליחה

### שליחת הסיכום
```javascript
async function summarize() {
  const formData = new FormData();
  files.forEach(f => formData.append("files", f));
  const config = {
    language: document.getElementById("language").value,
    output_format: document.getElementById("format").value,
    max_length: parseInt(document.getElementById("maxLength").value),
    parameters: getParametersList()
  };
  formData.append("config_override", JSON.stringify(config));
  showLoading();
  const res = await fetch("/summarize", { method: "POST", body: formData });
  const data = await res.json();
  // אם חסר API Key — פתח הגדרות
  if (data.error === "missing_api_key") {
    openSettingsPanel();
    showBanner("יש להגדיר API Key בהגדרות", "error");
    return;
  }
  renderResults(data.results);
}
```

### ייצוא
```javascript
async function exportSummary(filename, summary, format) {
  const res = await fetch(`/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, summary })
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}_summary.${format}`;
  a.click();
}
```

### מצבי UI
- **ריק:** אזור גרירה + כפתור הגדרות
- **אין מפתח:** פאנל הגדרות נפתח אוטומטית + באנר אזהרה
- **טעינה:** spinner + הודעה "מעבד X קבצים..."
- **תוצאות:** כרטיס לכל קובץ עם הסיכום וכפתורי ייצוא
- **שגיאה:** הודעת שגיאה אדומה בתוך הכרטיס

---

## routers/summarize.py — config_override

- קבל גם `config_override: str = Form(None)` (JSON אופציונלי)
- אם קיים — מיזוג עם config.yaml (config_override מנצח):
```python
import json
config = load_config()
if config_override:
    override = json.loads(config_override)
    config["summarization"].update(override)
```

---

## static/style.css — עיצוב

- **כיוון:** RTL (`dir="rtl"` על `<html>`)
- **צבעי מותג:** רקע `#f5f7fa`, כרטיסים לבנים, כחול ראשי `#2563eb`
- **גופן:** `Segoe UI`, `Arial`, sans-serif
- **רספונסיבי:** עובד גם בחלון צר
- **Drop zone:** גבול מקווקו, צבע כחול בעת Drag-over
- **כפתור סיכום:** גדול, בולט, disabled בזמן טעינה
- **כרטיסי תוצאה:** צל עדין, ירוק בצד שמאל (הצלחה), אדום (שגיאה)

---

## הוראות הרצה

```bash
cd doc-summarizer-web
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
# פתח: http://localhost:8000
# הזן את ה-API Key דרך כפתור ⚙ בממשק
```

---

## נקודות קריטיות לשים לב

1. **API Key נשמר ב-settings.json** — לא env variable, לא config.yaml. מעולם לא נשלח חזרה לדפדפן במלואו
2. **GET /settings מחזיר רק hint** — 4 תווים אחרונים בלבד, לא המפתח עצמו
3. **קריאת קבצים ב-bytes** — FastAPI מחזיר `UploadFile`, קרא עם `await file.read()`
4. **קבצים זמניים** — אין צורך לשמור לדיסק, עבד הכל בזיכרון
5. **שגיאות לא עוצרות** — אם קובץ אחד נכשל, ממשיך לשאר
6. **CORS** — אין צורך (frontend ו-backend על אותו origin)
7. **ייצוא** — שמור קבצים זמניים ב-`/tmp/` והחזר FileResponse עם cleanup
8. **עברית ב-PDF** — DejaVuSans תומך בתווים; אם צריך RTL מלא, הסתפק ביישור ימין (TA_RIGHT)

---

## רצף הבנייה המומלץ

1. `requirements.txt` + `config.yaml`
2. `routers/settings.py` — שמירה וקריאה של API Key
3. `processors/` — חילוץ טקסט
4. `routers/summarize.py` — בדוק עם curl (עם API Key ב-settings.json)
5. `exporters/` — ייצוא PDF ו-DOCX
6. `routers/export.py`
7. `static/index.html` + `style.css` — מבנה כולל פאנל הגדרות
8. `static/app.js` — לוגיקה מלאה כולל checkSettings בטעינה
9. `main.py` — הרכבה סופית + בדיקה מקצה לקצה
