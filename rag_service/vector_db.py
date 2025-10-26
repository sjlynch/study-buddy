"""
Vector database + embedding utilities.

- EmbeddingService: wraps a sentence-transformers model and returns L2-normalized
  vectors suitable for cosine similarity.
- FaissVectorDB: thread-safe FAISS IndexFlatIP wrapped with ID mapping and
  lightweight in-memory metadata store.
"""

from typing import List, Dict, Optional
import threading
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer


class EmbeddingService:
    """
    Tiny wrapper around SentenceTransformer.

    Notes:
    - We normalize embeddings here (normalize_embeddings=True) so that FAISS
      inner product (IndexFlatIP) corresponds to cosine similarity.
    """
    def __init__(self, model_name: str = "all-MiniLM-L6-v2", device: Optional[str] = None):
        self._model = SentenceTransformer(model_name, device=device)

    def embed(self, texts: List[str]) -> np.ndarray:
        """
        Encode a list of texts into L2-normalized float32 vectors.

        Returns:
            np.ndarray of shape (N, D) with unit-length rows.
        """
        embs = self._model.encode(
            texts,
            batch_size=32,
            convert_to_numpy=True,
            normalize_embeddings=True,  # ensures cosine via inner product
            show_progress_bar=False,
        )
        return embs.astype("float32")


class FaissVectorDB:
    """
    Minimal FAISS-backed vector store.

    Fields:
        _embedder: EmbeddingService used to create vectors.
        _dim: Embedding dimension (e.g., 384 for all-MiniLM-L6-v2).
        _index: FAISS IndexIDMap2 over IndexFlatIP (inner-product for cosine).
        _texts: Maps integer IDs -> original chunk text.
        _metas: Maps integer IDs -> metadata dict associated with the text.
        _next_id: Monotonic integer ID assigned to inserted vectors.
        _lock: Threading lock to make add/search/reset safe across requests.
    """

    def __init__(self, embedder: EmbeddingService):
        self._embedder = embedder

        # Probe once to discover embedding dimensionality (avoids magic numbers).
        _probe = self._embedder.embed(["__dim_probe__"])
        self._dim = int(_probe.shape[1])

        self._lock = threading.Lock()
        self._reset_index()
        self._texts: Dict[int, str] = {}
        self._metas: Dict[int, Dict] = {}
        self._next_id = 1

    def _reset_index(self) -> None:
        """
        Initialize a fresh FAISS index.

        IndexFlatIP expects inner products; with normalized vectors, this equals
        cosine similarity. IndexIDMap2 lets us use our own integer IDs.
        """
        base = faiss.IndexFlatIP(self._dim)
        self._index = faiss.IndexIDMap2(base)

    def reset(self) -> None:
        """
        Clear the index and all stored texts/metadata.
        """
        with self._lock:
            self._reset_index()
            self._texts.clear()
            self._metas.clear()
            self._next_id = 1

    def add_texts(self, texts: List[str], metadatas: Optional[List[Dict]] = None) -> List[int]:
        """
        Add a batch of texts (and optional metadata) to the index.

        Args:
            texts: Non-empty list of strings.
            metadatas: Optional list of dicts aligned with texts.

        Returns:
            List of assigned integer IDs (one per text).
        """
        if not texts:
            return []

        embs = self._embedder.embed(texts)
        ids = [self._next_id + i for i in range(len(texts))]

        with self._lock:
            self._next_id += len(texts)
            self._index.add_with_ids(embs, np.array(ids, dtype=np.int64))
            for i, tid in enumerate(ids):
                self._texts[tid] = texts[i]
                self._metas[tid] = (metadatas[i] if metadatas and i < len(metadatas) else {}) or {}

        return ids

    def search(self, query: str, top_k: int) -> List[Dict]:
        """
        Search the index using cosine similarity (via inner product on normalized vectors).

        Args:
            query: Natural-language query string.
            top_k: Maximum result count to return.

        Returns:
            List of dicts: {id, score, text, metadata}.
            Scores are cosine similarities in [-1, 1].
        """
        if top_k <= 0:
            return []

        with self._lock:
            if self._index.ntotal == 0:
                return []

        q = self._embedder.embed([query])
        D, I = self._index.search(q, top_k)

        results: List[Dict] = []
        for idx, score in zip(I[0], D[0]):
            if idx == -1:
                continue
            results.append({
                "id": int(idx),
                "score": float(score),
                "text": self._texts.get(int(idx), ""),
                "metadata": self._metas.get(int(idx), {}),
            })
        return results
