import fitz


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
