from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from bidi.algorithm import get_display
from pathlib import Path
import io
import datetime

_FONT_PATHS = [
    "/Library/Fonts/Arial Unicode.ttf",
    "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
]

_FONT_NAME = "Helvetica"

for _path in _FONT_PATHS:
    if Path(_path).exists():
        pdfmetrics.registerFont(TTFont("ArialUnicode", _path))
        pdfmetrics.registerFont(TTFont("ArialUnicode-Bold", _path))
        _FONT_NAME = "ArialUnicode"
        break


def _bidi(text: str) -> str:
    return get_display(text)


def export_to_pdf(filename: str, summary: str) -> bytes:
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        rightMargin=50, leftMargin=50,
        topMargin=60, bottomMargin=60
    )
    styles = getSampleStyleSheet()
    rtl_style = ParagraphStyle(
        "RTL", parent=styles["Normal"],
        alignment=TA_RIGHT, fontSize=12, leading=20,
        fontName=_FONT_NAME
    )
    title_style = ParagraphStyle(
        "Title", parent=styles["Heading1"],
        alignment=TA_RIGHT, fontSize=16,
        fontName=_FONT_NAME
    )

    story = [
        Paragraph(_bidi(filename), title_style),
        Spacer(1, 12),
        Paragraph(_bidi(f"סיכום — {datetime.date.today()}"), rtl_style),
        Spacer(1, 20),
    ]
    for line in summary.split("\n"):
        if line.strip():
            safe = (line.strip()
                    .replace("&", "&amp;")
                    .replace("<", "&lt;")
                    .replace(">", "&gt;"))
            story.append(Paragraph(_bidi(safe), rtl_style))
            story.append(Spacer(1, 6))

    doc.build(story)
    return buffer.getvalue()
