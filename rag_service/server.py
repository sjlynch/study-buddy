from typing import List, Dict, Optional
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
import uvicorn
from vector_db import EmbeddingService, FaissVectorDB
from document_ingest import read_and_chunk, ingest_docs
from search_logging import print_search_results

app = FastAPI()
_embedder = EmbeddingService()
_db = FaissVectorDB(_embedder)

class SearchReq(BaseModel):
    query: str
    top_k: int = Field(5, ge=1, le=100)

class SearchHit(BaseModel):
    id: int
    score: float
    text: str
    metadata: Dict = {}

class SearchResp(BaseModel):
    results: List[SearchHit]

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"detail": "Internal Server Error", "error": str(exc)})

@app.on_event("startup")
async def startup_auto_ingest():
    ingest_docs(_db)

@app.get("/healthz")
async def healthz():
    return {"status": "ok", "indexed": _db._index.ntotal}

@app.post("/search", response_model=SearchResp)
async def search(req: SearchReq):
    try:
        hits = _db.search(req.query, req.top_k)
        print_search_results(req.query, req.top_k, hits)
        return SearchResp(results=[SearchHit(**h) for h in hits])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
