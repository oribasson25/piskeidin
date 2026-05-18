from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4
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
        pdfmetrics.registerFont(TTFont("AU", _path))
        _FONT_NAME = "AU"
        break


def _bidi(text: str) -> str:
    return get_display(text)


def _wrap_lines(c, text: str, font: str, size: int, max_width: float) -> list[str]:
    """Split text into lines that fit within max_width."""
    words = text.split(" ")
    lines = []
    current = ""
    for word in words:
        test = (current + " " + word).strip()
        if c.stringWidth(test, font, size) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines if lines else [text]


def export_to_pdf(filename: str, summary: str) -> bytes:
    buffer = io.BytesIO()
    w, h = A4
    c = rl_canvas.Canvas(buffer, pagesize=A4)

    margin_r = 50
    margin_l = 50
    text_width = w - margin_r - margin_l
    y = h - 60

    def new_page():
        nonlocal y
        c.showPage()
        y = h - 60

    def draw_right(text: str, font: str, size: int, extra_gap: float = 0):
        nonlocal y
        visual = _bidi(text)
        for line in _wrap_lines(c, visual, font, size, text_width):
            if y < 60:
                new_page()
            c.setFont(font, size)
            c.drawRightString(w - margin_r, y, line)
            y -= size * 1.6
        y -= extra_gap

    # Title
    draw_right(filename, _FONT_NAME, 16, extra_gap=6)

    # Date subtitle
    draw_right(f"סיכום — {datetime.date.today()}", _FONT_NAME, 10, extra_gap=14)

    # Divider
    c.setStrokeColorRGB(0.8, 0.8, 0.8)
    c.setLineWidth(0.5)
    c.line(margin_l, y + 4, w - margin_r, y + 4)
    y -= 16

    # Summary lines
    for line in summary.split("\n"):
        stripped = line.strip()
        if stripped:
            # Strip bullet characters; the visual layout makes structure clear
            clean = stripped.lstrip("•\-\*▪▸›»–◆◇○●■ ")
            draw_right(clean, _FONT_NAME, 12, extra_gap=4)

    c.save()
    return buffer.getvalue()
