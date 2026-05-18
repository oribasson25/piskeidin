from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from routers import summarize, export, settings

app = FastAPI(title="Document Summarizer")
app.include_router(settings.router)
app.include_router(summarize.router)
app.include_router(export.router)
app.mount("/", StaticFiles(directory="static", html=True), name="static")
