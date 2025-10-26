from typing import List, Dict, Tuple
import os
import json
from pypdf import PdfReader
from tqdm import tqdm

from chunk_service import chunk_text

_BASE_DIR = os.path.dirname(os.path.abspath(__file__))
PDF_DIR = os.path.join(_BASE_DIR, "data", "pdf")
JSON_DIR = os.path.join(_BASE_DIR, "data", "json")


def _ext_lower(src: str) -> str:
    _, ext = os.path.splitext(src)
    return (ext or "").lower()

def _detect_file_type(src: str) -> str:
    ext = _ext_lower(src)
    if ext == ".pdf":
        return "pdf"
    if ext == ".json":
        return "json"
    return "unknown"

def _resolve_path(src: str, file_type: str) -> str:
    """
    Resolve an incoming file name or relative path to an absolute path under
    the known PDF/JSON folders. Absolute or already-existing relative paths
    are respected as-is.
    """
    if os.path.isabs(src) and os.path.exists(src):
        return src
    if os.path.exists(src):
        return os.path.abspath(src)

    if file_type == "pdf":
        base = PDF_DIR
    elif file_type == "json":
        base = JSON_DIR
    else:
        base = _BASE_DIR

    candidate = os.path.abspath(os.path.join(base, src))
    return candidate

def _ingest_pdf(path: str) -> List[str]:
    """
    Load a PDF from a local path using pypdf and return paragraph-level chunks.
    """
    reader = PdfReader(path)
    texts: List[str] = []

    pages_iter = tqdm(reader.pages, total=len(reader.pages), desc=f"PDF pages: {os.path.basename(path)}", unit="page", leave=False)

    for page in pages_iter:
        page_text = page.extract_text() or ""
        if page_text:
            texts.append(page_text)
    joined = "\n".join(texts)
    parts = chunk_text(joined, show_progress=True)
    return parts

def _ingest_json_topics_contents(path: str) -> List[str]:
    """
    Read a JSON file with shape:
      { "topics": [ { "content": "..." }, ... ] }
    Extract ONLY each topic.content, chunk each by paragraph, and return all chunks.
    """
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    topics = data.get("topics", [])
    if not isinstance(topics, list):
        return []

    all_parts: List[str] = []
    topics_iter = tqdm(topics, desc=f"JSON topics: {os.path.basename(path)}", unit="topic", leave=False)

    for topic in topics_iter:
        if not isinstance(topic, dict):
            continue
        content = topic.get("content")
        if not isinstance(content, str) or not content.strip():
            continue
        parts = chunk_text(content, show_progress=True)
        all_parts.extend(parts)
    return all_parts

def read_and_chunk(paths_or_urls: List[str]) -> Tuple[List[str], List[Dict]]:
    """
    Route by detected file type, extract text, and chunk automatically.

    Returns:
        (chunks, metadatas) where each metadata minimally includes:
        {"source": <path>, "chunk_index": <int>}
    """
    chunks: List[str] = []
    metas: List[Dict] = []

    sources_iter = tqdm(paths_or_urls, desc="Ingesting files", unit="file")

    for src in sources_iter:
        file_type = _detect_file_type(src)
        path = _resolve_path(src, file_type)

        if file_type == "pdf":
            parts = _ingest_pdf(path)
        elif file_type == "json":
            parts = _ingest_json_topics_contents(path)
        else:
            parts = []

        for i, part in enumerate(parts):
            chunks.append(part)
            metas.append({"source": path, "chunk_index": i, "file_type": file_type})

    return chunks, metas

def list_known_data_files() -> List[str]:
    """
    Recursively scan the known data directories for supported files and return absolute paths.
    """
    paths: List[str] = []
    for base_dir, ext in [(PDF_DIR, ".pdf"), (JSON_DIR, ".json")]:
        try:
            if not os.path.isdir(base_dir):
                continue
            for root, _, files in os.walk(base_dir):
                for name in files:
                    if name.lower().endswith(ext):
                        paths.append(os.path.join(root, name))
        except Exception as e:
            print(f"[startup] Failed to read directory {base_dir}: {e}")
    return paths

def scan_data_folders() -> Tuple[List[str], List[Dict]]:
    """
    Convenience wrapper used at server startup:
    - Scans PDF/JSON data folders
    - Runs read_and_chunk on discovered files
    Returns combined (chunks, metadatas).
    """
    sources = list_known_data_files()
    if not sources:
        print("[startup] No PDF/JSON files found to ingest.")
        return [], []
    print(f"[startup] Found {len(sources)} file(s) to ingest.")
    chunks, metas = read_and_chunk(sources)
    if not chunks:
        print("[startup] Extraction yielded 0 chunks.")
    else:
        print(f"[startup] Prepared {len(chunks)} chunks from {len(sources)} file(s).")
    return chunks, metas

def ingest_docs(db) -> None:
    """
    Fully perform ingestion at startup by scanning folders, extracting, chunking,
    and inserting into the provided vector DB.
    """
    try:
        chunks, metas = scan_data_folders()
        if not chunks:
            return
        db.add_texts(chunks, metas)
        print(f"[startup] Ingested {len(chunks)} chunks.")
    except Exception as e:
        print(f"[startup] Auto-ingest failed: {e}")
