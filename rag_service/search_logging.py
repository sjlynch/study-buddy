from typing import List, Dict

__all__ = ["print_search_results"]

def _fmt_snippet(text: str, max_len: int = 140) -> str:
    # Collapse whitespace and trim for neat console output
    single_line = " ".join((text or "").split())
    return (single_line[:max_len] + "…") if len(single_line) > max_len else single_line

def print_search_results(query: str, top_k: int, hits: List[Dict]) -> None:
    try:
        print("\n[search] ----------------------------------------")
        print(f"[search] query: {query!r}  top_k: {top_k}")
        if not hits:
            print("[search] results: 0")
            print("[search] ----------------------------------------\n")
            return
        print(f"[search] results: {len(hits)}")
        for i, h in enumerate(hits, 1):
            meta = h.get("metadata", {}) or {}
            src = meta.get("source", "?")
            chunk_idx = meta.get("chunk_index", "?")
            ftype = meta.get("file_type", "?")
            score = float(h.get("score", 0.0))
            tid = int(h.get("id", -1))
            print(f"  {i:>2}. id={tid}  score={score:.3f}  source={src}  chunk={chunk_idx}  type={ftype}")
            print(f"      { _fmt_snippet(h.get('text', '')) }")
        print("[search] ----------------------------------------\n")
    except Exception as _:
        # Never fail the request due to logging.
        pass
