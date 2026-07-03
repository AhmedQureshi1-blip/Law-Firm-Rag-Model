"""
app.py

FastAPI entrypoint. Run with:
    uvicorn app:app --reload
"""

from fastapi import FastAPI

from routers.ingestion import router as ingestion_router
from routers.memo import router as memo_router

app = FastAPI(
    title="Legal Due Diligence Ingestion API",
    description="Day 2-3: Document ingestion, embedding, and memo generation for Pakistani legal due diligence.",
    version="0.3.0",
)

app.include_router(ingestion_router, tags=["ingestion"])
app.include_router(memo_router, tags=["memo"])


@app.get("/health")
def health_check():
    return {"status": "ok"}
