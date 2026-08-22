"""Embedding abstraction.

Two implementations:
- SentenceTransformerEmbedder: local MiniLM (real). sentence-transformers is
  imported lazily so unit tests / lightweight imports don't pay the cost.
- FakeEmbedder: deterministic, fixed-dimension vectors for tests (no model).
"""
from __future__ import annotations

import hashlib
import math
from typing import Protocol


class EmbeddingProvider(Protocol):
    dim: int

    def embed(self, texts: list[str]) -> list[list[float]]: ...


class SentenceTransformerEmbedder:
    dim = 384  # all-MiniLM-L6-v2

    def __init__(self, model_name: str) -> None:
        self._model_name = model_name
        self._model = None

    def _ensure(self):
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            self._model = SentenceTransformer(self._model_name)
        return self._model

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._ensure()
        vectors = model.encode(texts, normalize_embeddings=True)
        return [list(map(float, v)) for v in vectors]


class FakeEmbedder:
    """Deterministic embedder for tests. NOT a real semantic model.

    Produces stable, normalized, fixed-dimension vectors so cosine similarity
    and retrieval logic can be tested without downloading a model or using a GPU.
    """

    dim = 384

    def embed(self, texts: list[str]) -> list[list[float]]:
        out = []
        for t in texts:
            vec = [0.0] * self.dim
            # Seed multiple dimensions from the text hash so similar-ish inputs
            # still differ; good enough to exercise fusion/ranking code paths.
            h = hashlib.sha256(t.encode("utf-8")).digest()
            for i in range(self.dim):
                byte = h[i % len(h)]
                vec[i] = ((byte / 255.0) - 0.5) * 2.0
            norm = math.sqrt(sum(v * v for v in vec)) or 1.0
            out.append([v / norm for v in vec])
        return out


def get_default_embedder(model_name: str | None = None) -> EmbeddingProvider:
    # Real embedder is the default. Tests override this via dependency injection.
    return SentenceTransformerEmbedder(model_name or "sentence-transformers/all-MiniLM-L6-v2")
