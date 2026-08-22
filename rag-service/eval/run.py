"""Offline evaluation runner (Phase 4 baseline).

Compares retrieval strategies on the gold set:
  - vector-only (cosine over the offline BoW embedder)
  - hybrid (vector + Postgres-FTS-style keyword fused via RRF) using the real store

Also reports heuristic answer-quality (faithfulness proxy) for the hybrid top context.
Production answer relevance / faithfulness should be measured with an LLM judge
(ADR-023); this runner is a deterministic, model-free baseline.

Run:  python -m eval.run
"""
from __future__ import annotations

import json
import uuid

from app.ingestion import chunk_text
from app.retrieval import InMemoryRetrievalStore
from .embed import BagOfWordsEmbedder
from .gold import GOLD_DOCUMENTS, GOLD_QUERIES
from .metrics import (
    faithfulness_proxy,
    mrr,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
)

USER = "eval-user"
KS = [3, 5]


def _build_store() -> tuple[InMemoryRetrievalStore, BagOfWordsEmbedder]:
    all_chunks: list[dict] = []
    for doc in GOLD_DOCUMENTS:
        parts = chunk_text(doc["text"], chunk_size=1500, overlap=200)
        for p in parts:
            all_chunks.append(
                {
                    "documentId": doc["documentId"],
                    "userId": doc["userId"],
                    "type": doc["type"],
                    "sourceFilename": doc["sourceFilename"],
                    "chunk_text": p["text"],
                    "section": p.get("section"),
                    "page": p.get("page"),
                }
            )

    embedder = BagOfWordsEmbedder()
    embedder.fit([c["chunk_text"] for c in all_chunks])
    vectors = embedder.embed([c["chunk_text"] for c in all_chunks])

    store_chunks = []
    for c, vec in zip(all_chunks, vectors):
        store_chunks.append(
            {
                "chunk_id": str(uuid.uuid4()),
                "document_id": c["documentId"],
                "user_id": c["userId"],
                "doc_type": c["type"],
                "source_filename": c["sourceFilename"],
                "chunk_text": c["chunk_text"],
                "section": c.get("section"),
                "page": c.get("page"),
                "embedding": vec,
            }
        )

    store = InMemoryRetrievalStore()
    store.index_chunks(store_chunks)
    return store, embedder


def _vector_only_ranking(store: InMemoryRetrievalStore, embedder: BagOfWordsEmbedder, query_vec: list[float], top_k: int):
    pool = [c for c in store._chunks if c["user_id"] == USER]
    ranked = sorted(pool, key=lambda c: embedder.cosine(c["embedding"], query_vec), reverse=True)
    return ranked[:top_k]


def main() -> dict:
    store, embedder = _build_store()
    summary: dict = {"vector_only": _aggregate(), "hybrid": _aggregate()}

    for q in GOLD_QUERIES:
        q_vec = embedder.embed([q["query"]])[0]
        vo = _vector_only_ranking(store, embedder, q_vec, max(KS))
        hy = store.hybrid_search(USER, q["query"], q_vec, top_k=max(KS))

        rel_ids = {
            c["chunk_id"] for c in store._chunks if c["document_id"] in q["relevantDocs"]
        }

        for variant, ranked in (("vector_only", vo), ("hybrid", hy)):
            ids = [c["chunk_id"] for c in ranked]
            for k in KS:
                summary[variant]["recall"][k].append(recall_at_k(ids, rel_ids, k))
                summary[variant]["precision"][k].append(precision_at_k(ids, rel_ids, k))
                summary[variant]["ndcg"][k].append(ndcg_at_k(ids, rel_ids, k))
            summary[variant]["mrr"].append(mrr(ids, rel_ids))

            if variant == "hybrid":
                contexts = [c["chunk_text"] for c in hy[:3]]
                answer = " ".join(contexts)
                summary[variant]["faithfulness"].append(
                    faithfulness_proxy(answer, contexts)
                )

    # Average
    out = {}
    for variant, agg in summary.items():
        out[variant] = {
            "recall@k": {k: _mean(agg["recall"][k]) for k in KS},
            "precision@k": {k: _mean(agg["precision"][k]) for k in KS},
            "ndcg@k": {k: _mean(agg["ndcg"][k]) for k in KS},
            "mrr": _mean(agg["mrr"]),
        }
        if agg["faithfulness"]:
            out[variant]["faithfulness_proxy"] = _mean(agg["faithfulness"])

    print(json.dumps(out, indent=2))
    return out


def _aggregate() -> dict:
    return {
        "recall": {k: [] for k in KS},
        "precision": {k: [] for k in KS},
        "ndcg": {k: [] for k in KS},
        "mrr": [],
        "faithfulness": [],
    }


def _mean(xs: list[float]) -> float:
    return round(sum(xs) / len(xs), 4) if xs else 0.0


if __name__ == "__main__":
    main()
