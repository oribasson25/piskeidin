from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from routers import summarize, export, settings, court_analyze, analyze_export

app = FastAPI(title="Document Summarizer")
app.include_router(settings.router)
app.include_router(summarize.router)
app.include_router(export.router)
app.include_router(court_analyze.router)
app.include_router(analyze_export.router)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
