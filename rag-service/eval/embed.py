"""Offline stand-in embedder for the eval harness.

The production system uses MiniLM (384-dim) via sentence-transformers, which is not
installed in the local/test environment. For *offline retrieval comparison* we use a
bag-of-words TF vector so that cosine similarity correlates with lexical overlap.
This makes vector-only vs hybrid differences observable without a model. It is NOT a
substitute for the real embedder and must not ship to production retrieval.
"""
from __future__ import annotations

import math
import re
from collections import Counter


class BagOfWordsEmbedder:
    def __init__(self) -> None:
        self._vocab: dict[str, int] = {}
        self._fitted = False

    def fit(self, corpus: list[str]) -> None:
        idx = 0
        for text in corpus:
            for tok in self._tokenize(text):
                if tok not in self._vocab:
                    self._vocab[tok] = idx
                    idx += 1
        self._fitted = True

    @staticmethod
    def _tokenize(text: str) -> list[str]:
        return [t for t in re.findall(r"[a-z0-9]+", text.lower()) if len(t) > 2]

    def embed(self, texts: list[str]) -> list[list[float]]:
        if not self._fitted:
            raise RuntimeError("BagOfWordsEmbedder must be fit() before embed()")
        out = []
        for text in texts:
            counts = Counter(self._tokenize(text))
            vec = [0.0] * len(self._vocab)
            norm = 0.0
            for tok, c in counts.items():
                if tok in self._vocab:
                    v = float(c)
                    vec[self._vocab[tok]] = v
                    norm += v * v
            if norm > 0:
                norm = math.sqrt(norm)
                vec = [x / norm for x in vec]
            out.append(vec)
        return out

    def cosine(self, a: list[float], b: list[float]) -> float:
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a)) or 1.0
        nb = math.sqrt(sum(y * y for y in b)) or 1.0
        return dot / (na * nb)
