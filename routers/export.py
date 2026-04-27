import os
import tempfile
from fastapi import APIRouter
from fastapi.responses import FileResponse
from exporters.pdf_exporter import export_to_pdf
from exporters.docx_exporter import export_to_docx

router = APIRouter()


@router.post("/export/pdf")
async def export_pdf(body: dict):
    filename = body.get("filename", "document")
    summary = body.get("summary", "")
    pdf_bytes = export_to_pdf(filename, summary)

    base = os.path.splitext(filename)[0]
    tmp = tempfile.NamedTemporaryFile(
        delete=False, suffix=".pdf",
        dir="/tmp", prefix=f"{base}_summary_"
    )
    tmp.write(pdf_bytes)
    tmp.close()

    return FileResponse(
        path=tmp.name,
        media_type="application/pdf",
        filename=f"{base}_summary.pdf",
        background=None
    )


@router.post("/export/docx")
async def export_docx(body: dict):
    filename = body.get("filename", "document")
    summary = body.get("summary", "")
    docx_bytes = export_to_docx(filename, summary)

    base = os.path.splitext(filename)[0]
    tmp = tempfile.NamedTemporaryFile(
        delete=False, suffix=".docx",
        dir="/tmp", prefix=f"{base}_summary_"
    )
    tmp.write(docx_bytes)
    tmp.close()

    return FileResponse(
        path=tmp.name,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"{base}_summary.docx",
        background=None
    )
