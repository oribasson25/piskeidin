import tempfile
from pathlib import Path
from fastapi import APIRouter
from fastapi.responses import FileResponse
from exporters.excel_exporter import export_to_excel

router = APIRouter()


@router.post("/export/excel")
async def export_excel(body: dict):
    results = body.get("results", [])
    xlsx_bytes = export_to_excel(results)

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    tmp.write(xlsx_bytes)
    tmp.flush()
    tmp.close()

    return FileResponse(
        path=tmp.name,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename="piskei_din.xlsx",
        background=None,
    )
