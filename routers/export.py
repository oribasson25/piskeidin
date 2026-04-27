import io
from urllib.parse import quote
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from exporters.pdf_exporter import export_to_pdf
from exporters.docx_exporter import export_to_docx

router = APIRouter()


@router.post("/export/pdf")
async def export_pdf(body: dict):
    filename = body.get("filename", "document")
    summary  = body.get("summary", "")
    pdf_bytes = export_to_pdf(filename, summary)
    base = filename.rsplit(".", 1)[0] if "." in filename else filename
    out_name = f"{base}_summary.pdf"
    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(out_name)}"}
    )


@router.post("/export/docx")
async def export_docx(body: dict):
    filename = body.get("filename", "document")
    summary  = body.get("summary", "")
    docx_bytes = export_to_docx(filename, summary)
    base = filename.rsplit(".", 1)[0] if "." in filename else filename
    out_name = f"{base}_summary.docx"
    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(out_name)}"}
    )
