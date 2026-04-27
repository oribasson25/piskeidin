from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_RIGHT
import io
import datetime


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
        alignment=TA_RIGHT, fontSize=12, leading=20
    )
    title_style = ParagraphStyle(
        "Title", parent=styles["Heading1"],
        alignment=TA_RIGHT, fontSize=16
    )

    story = [
        Paragraph(filename, title_style),
        Spacer(1, 12),
        Paragraph(f"סיכום — {datetime.date.today()}", rtl_style),
        Spacer(1, 20),
    ]
    for line in summary.split("\n"):
        if line.strip():
            safe_line = line.strip().replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
            story.append(Paragraph(safe_line, rtl_style))
            story.append(Spacer(1, 6))

    doc.build(story)
    return buffer.getvalue()
