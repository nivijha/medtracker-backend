#!/usr/bin/env python3
"""medtracker_fsh_diagnostic.py - READ-ONLY retrieval diagnostic (no writes).

Determines, for "What was the patient's FSH according to the uploaded report?":
  1. is there text matching FSH in any indexed chunk for the user's documents
  2. does the production-equivalent hybrid_search retrieve any FSH chunk
  3. what are its retrieval rank, rerank rank, rerank score, similarity
  4. do optional document-id/type filters include or exclude it

Read-only guarantees
--------------------
* NEVER instantiates PostgresRetrievalStore / get_default_store(): their
  constructors run CREATE EXTENSION + create_all (DDL writes). This script
  mirrors the exact production hybrid_search SQL using SELECT-only statements.
* Every transaction is opened with .execution_options(readonly=True): any
  accidental write is rejected by PostgreSQL at the transaction level.
* No index_chunks, no create_all, no settings mutation, no deployment.
* DATABASE_URL is read from app config and is NEVER printed or written.

PHI safeguards
--------------
* Output JSON contains metadata ONLY: chunk_id, document_id (opaque UUIDs),
  doc_type, section, page, report_date, text_length, boolean FSH flags,
  similarity/score/ranks. NO chunk_text, NO query text, NO patient names,
  NO source filenames, NO user_id (masked), NO credentials, NO connection URL.
* FSH is detected as a boolean via regex; the matching text is never emitted.
* The production embedding Lambda receives the query (required for an
  equivalent reproduction). The production reranker Lambda receives the top-N
  candidate TEXT strings when DIAG_RERANK=1 (default) - the same request the
  production pipeline itself makes. Set DIAG_RERANK=0 to skip reranking.

Usage (run from rag-service/ so .env is loaded):
    export DIAG_USER_ID="<account id>"         # required; full value never stored
    export DIAG_DOCUMENT_IDS="<optional,uuid>" # optional comma-separated
    export DIAG_DOC_TYPES="<optional,lab>"     # optional comma-separated
    export DIAG_RERANK=1                       # 0 to skip reranker Lambda call
    export DIAG_OUTPUT="<optional path>"       # defaults to OS temp dir
    python -m scripts.fsh_diagnostic

Exit codes: 0 success; 1 configuration error; 2 query/connection error.
"""
from __future__ import annotations

import hashlib
import json
import math
import os
import re
import sys
import tempfile
import time
from pathlib import Path

# --- local copies of production logic (no FastAPI import) -------------------
# Mirrors app.api.query._NOISE_RE / _is_noisy
_NOISE_RE = re.compile(
    r"^(\[:|LPL[-\s].*LAB|DMC\s*-\s*\d+|IMPORTANT INSTRUCTIONS|CGHS|Test conducted|Page\s*\d+)",
    re.IGNORECASE,
)
# "FSH" abbreviation, word-boundary, case-insensitive
_FSH_ABBREV_RE = re.compile(r"\bfsh\b", re.IGNORECASE)
# "follicle-stimulating(-?)hormone" variants
_FSH_FULL_RE = re.compile(r"follicle[\s-]?stimat(?:ing|ed)", re.IGNORECASE)

_DEFAULT_QUERY = "What was the patient's FSH according to the uploaded report?"
_DEFAULT_OUTPUT = os.path.join(tempfile.gettempdir(), "medtracker_fsh_diagnostic.json")


def _mask_user(uid: str) -> str:
    if len(uid) <= 2:
        return "***"
    return f"{uid[0]}***{uid[-1]}"


def _is_noisy(section: str | None, chunk_text: str) -> bool:
    sec = (section or "").strip()
    txt = (chunk_text or "").strip()
    if sec and _NOISE_RE.match(sec):
        return True
    if txt and _NOISE_RE.match(txt) and len(txt) < 120:
        return True
    return False


def _env_filters() -> dict:
    """Build an optional filter dict from DIAG_* env vars (mirrors filters_to_dict)."""
    f: dict = {}
    dids = [s.strip() for s in os.environ.get("DIAG_DOCUMENT_IDS", "").split(",") if s.strip()]
    dts = [s.strip() for s in os.environ.get("DIAG_DOC_TYPES", "").split(",") if s.strip()]
    if dids:
        f["documentIds"] = dids
    if dts:
        f["documentTypes"] = dts
    dfrom = os.environ.get("DIAG_DATE_FROM", "").strip()
    dto = os.environ.get("DIAG_DATE_TO", "").strip()
    if dfrom:
        f["dateFrom"] = dfrom
    if dto:
        f["dateTo"] = dto
    return f


def main() -> int:
    uid = os.environ.get("DIAG_USER_ID", "").strip()
    if not uid:
        print("ERROR: DIAG_USER_ID environment variable is required.", file=sys.stderr)
        return 1

    # --- imports that require app packages / .env (CWD = rag-service) -------
    from app.config import settings
    from app.retrieval import _rrf

    db_url = settings.pg_rag_database_url or settings.database_url
    if not db_url:
        print("ERROR: no DATABASE_URL/PG_RAG_DATABASE_URL in config.", file=sys.stderr)
        return 1

    query = os.environ.get("DIAG_QUERY", _DEFAULT_QUERY).strip()
    do_rerank = os.environ.get("DIAG_RERANK", "1").strip() not in ("0", "false")
    output_path = os.environ.get("DIAG_OUTPUT", _DEFAULT_OUTPUT).strip()

    # ------------------------------------------------------------------ embed
    try:
        from app.embedding import get_default_embedder

        embedder = get_default_embedder()
        query_vec = embedder.embed([query])[0]
    except Exception as e:
        print(
            f"ERROR: failed to embed query via {getattr(settings, 'embedding_provider', '?')}: {e}",
            file=sys.stderr,
        )
        return 2

    from sqlalchemy import create_engine, func, select
    from sqlalchemy.exc import SQLAlchemyError

    from app.db_models import DocumentChunk

    engine = create_engine(db_url, future=True)

    # ------------------------------------------------------------------- SQL
    def base_where(f: dict):
        from datetime import date as _date

        b = DocumentChunk.user_id == uid
        if f.get("documentTypes"):
            b &= DocumentChunk.doc_type.in_(f["documentTypes"])
        if f.get("documentIds"):
            b &= DocumentChunk.document_id.in_(f["documentIds"])
        if f.get("sections"):
            b &= DocumentChunk.section.in_(f["sections"])
        if f.get("dateFrom"):
            b &= DocumentChunk.report_date >= _date.fromisoformat(f["dateFrom"])
        if f.get("dateTo"):
            b &= DocumentChunk.report_date <= _date.fromisoformat(f["dateTo"])
        return b

    def run_hybrid(f: dict) -> tuple[list[dict], dict]:
        """Mirror PostgresRetrievalStore.hybrid_search exactly; SELECT only."""
        top_n = int(settings.rerank_top_n)
        limit = max(top_n * 3, 50)
        w = base_where(f)

        pool_stmt = select(
            DocumentChunk.chunk_id,
            DocumentChunk.document_id,
            DocumentChunk.doc_type,
            DocumentChunk.report_date,
            DocumentChunk.page,
            DocumentChunk.section,
            DocumentChunk.chunk_text,
        ).where(w)

        vstmt = (
            select(DocumentChunk.chunk_id, DocumentChunk.embedding.cosine_distance(query_vec).label("d"))
            .where(w)
            .order_by("d")
            .limit(limit)
        )
        kstmt = (
            select(
                DocumentChunk.chunk_id,
                func.ts_rank(func.to_tsvector("english", DocumentChunk.chunk_text), func.plainto_tsquery("english", query)).label("r"),
            )
            .where(w)
            .where(func.to_tsvector("english", DocumentChunk.chunk_text).op("@@")(func.plainto_tsquery("english", query)))
            .order_by("r")
            .limit(limit)
        )

        with engine.connect() as conn:
            ro = conn.execution_options(readonly=True)
            with ro.begin():
                pool_rows = ro.execute(pool_stmt).all()
                v_rows = ro.execute(vstmt).all()
                k_rows = ro.execute(kstmt).all()

        pool = [
            {
                "chunk_id": str(cid),
                "document_id": did,
                "doc_type": dt,
                "report_date": str(rdate) if rdate else None,
                "page": pg,
                "section": sec,
                "chunk_text": txt,
            }
            for cid, did, dt, rdate, pg, sec, txt in pool_rows
        ]
        by_id = {c["chunk_id"]: c for c in pool}
        v_rank = [str(cid) for cid, _d in v_rows]
        sim_by_id = {str(cid): round(1.0 - float(d), 6) for cid, d in v_rows}
        k_rank = [str(cid) for cid, _r in k_rows]
        fused = _rrf([v_rank, k_rank], k=int(getattr(settings, "rrf_k", 60)))
        ordered = [cid for cid in sorted(fused, key=lambda x: fused[x], reverse=True) if cid in by_id][:top_n]
        result = []
        for cid in ordered:
            c = dict(by_id[cid])
            c["score"] = round(fused[cid], 6)
            if cid in sim_by_id:
                c["similarity"] = sim_by_id[cid]
            result.append(c)
        return result, {"vector_pool": len(pool), "v_rank": len(v_rank), "k_rank": len(k_rank)}

    # --------------------------------------------------------------- inventory
    env_inv = _env_filters()
    CAP = 10000
    inv_fields = (
        select(
            DocumentChunk.chunk_id,
            DocumentChunk.document_id,
            DocumentChunk.doc_type,
            DocumentChunk.report_date,
            DocumentChunk.page,
            DocumentChunk.section,
            DocumentChunk.chunk_text,
            DocumentChunk.embedding,
        )
        .where(DocumentChunk.user_id == uid)
        .limit(CAP)
    )

    # optional inventory scoping (default: all the user's chunks)
    if env_inv:
        inv_fields = inv_fields.where(base_where(env_inv))

    try:
        with engine.connect() as conn:
            ro = conn.execution_options(readonly=True)
            with ro.begin():
                inv_rows = ro.execute(inv_fields).all()
    except SQLAlchemyError as e:
        print(f"ERROR: read-only query failed: {e}", file=sys.stderr)
        return 2

    def cosine(a, b):
        dot = sum(x * y for x, y in zip(a, b))
        na = math.sqrt(sum(x * x for x in a)) or 1.0
        nb = math.sqrt(sum(y * y for y in b)) or 1.0
        return dot / (na * nb)

    inventory_meta: list[dict] = []
    fsh_chunks: list[dict] = []
    for cid, did, dt, rdate, pg, sec, txt, emb in inv_rows:
        txt = txt or ""
        sim = round(cosine(query_vec, list(emb)), 6)
        meta = {
            "chunk_id": str(cid),
            "document_id": did,
            "doc_type": dt,
            "report_date": str(rdate) if rdate else None,
            "page": pg,
            "section": sec,
            "text_length": len(txt),
            "similarity_to_query": sim,
            "fsh_abbrev": bool(_FSH_ABBREV_RE.search(txt)),
            "fsh_full": bool(_FSH_FULL_RE.search(txt)),
            "noise_flagged": _is_noisy(sec, txt),
        }
        inventory_meta.append(meta)
        if meta["fsh_abbrev"] or meta["fsh_full"]:
            fsh_chunks.append(meta)

    truncated = len(inv_rows) >= CAP
    total_chunks = len(inventory_meta)

    # ------------------------------------------------------------ retrieval(s)
    ret_a, stats_a = run_hybrid({})

    run_b_filters = env_inv if env_inv else None
    ret_b, stats_b = (run_hybrid(run_b_filters), {"note": "no filters supplied"}) if env_inv else (None, None)

    def fsh_rank_in_retrieved(retrieved: list[dict]) -> list[dict]:
        out = []
        for i, c in enumerate(retrieved):
            txt = c.get("chunk_text") or ""
            is_fsh = bool(_FSH_ABBREV_RE.search(txt)) or bool(_FSH_FULL_RE.search(txt))
            if is_fsh:
                out.append(
                    {
                        "retrieval_rank": i,
                        "chunk_id": c["chunk_id"],
                        "document_id": c["document_id"],
                        "similarity": c.get("similarity"),
                        "score": c.get("score"),
                        "noise_flagged": _is_noisy(c.get("section"), txt),
                    }
                )
        return out

    fsh_retrieved_a = fsh_rank_in_retrieved(ret_a)
    fsh_retrieved_b = fsh_rank_in_retrieved(ret_b) if ret_b is not None else None

    # ------------------------------------------------------- rerank (optional)
    rerank_result: dict = {
        "enabled": do_rerank,
        "performed": False,
        "error": None,
        "top_candidate": None,
        "fsh_entries": [],
    }
    if do_rerank and ret_a:
        url = getattr(settings, "lambda_reranker_url", "")
        secret = getattr(settings, "lambda_reranker_secret", "")
        top_k = int(getattr(settings, "top_k", 10))
        if not url:
            rerank_result["error"] = "lambda_reranker_url not configured; skipped"
        else:
            import httpx

            payload_candidates = [
                {"chunk_id": c["chunk_id"], "chunk_text": c["chunk_text"]} for c in ret_a
            ]
            headers = {"Content-Type": "application/json"}
            if secret:
                headers["X-Rerank-Secret"] = secret
            try:
                timeout = float(getattr(settings, "reranker_read_timeout", 30.0))
                with httpx.Client(timeout=timeout) as client:
                    resp = client.post(
                        url,
                        headers=headers,
                        json={"query": query, "candidates": payload_candidates, "top_k": top_k},
                    )
                resp.raise_for_status()
                data = resp.json()
                score_by_id = {
                    str(r["chunk_id"]): float(r["rerank_score"])
                    for r in data.get("reranked", [])
                    if isinstance(r, dict) and r.get("chunk_id") is not None and r.get("rerank_score") is not None
                }
            except Exception as e:
                rerank_result["error"] = f"{type(e).__name__}: {str(e)[:200]}"
            else:
                ranked = sorted(ret_a, key=lambda x: score_by_id.get(x["chunk_id"], -1e9), reverse=True)
                top = ranked[:top_k]
                rerank_result["performed"] = True
                if top:
                    t0 = top[0]
                    rerank_result["top_candidate"] = {
                        "rerank_rank": 0,
                        "chunk_id": t0["chunk_id"],
                        "rerank_score": score_by_id.get(t0["chunk_id"]),
                        "similarity": t0.get("similarity"),
                        "is_fsh": bool(_FSH_ABBREV_RE.search(t0.get("chunk_text") or ""))
                        or bool(_FSH_FULL_RE.search(t0.get("chunk_text") or "")),
                    }
                rerank_result["fsh_entries"] = []
                for ri, cc in enumerate(top):
                    txt = cc.get("chunk_text") or ""
                    if bool(_FSH_ABBREV_RE.search(txt)) or bool(_FSH_FULL_RE.search(txt)):
                        rerank_result["fsh_entries"].append(
                            {
                                "rerank_rank": ri,
                                "chunk_id": cc["chunk_id"],
                                "rerank_score": score_by_id.get(cc["chunk_id"]),
                                "similarity": cc.get("similarity"),
                            }
                        )
                rerank_result["all_ranked"] = [
                    {
                        "rank": i,
                        "chunk_id": c["chunk_id"],
                        "rerank_score": score_by_id.get(c["chunk_id"]),
                        "similarity": c.get("similarity"),
                    }
                    for i, c in enumerate(ranked)
                ]

    # ------------------------------------------------------------ output file
    report = {
        "run_meta": {
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "index_version": getattr(settings, "index_version", None),
            "embedding_provider": getattr(settings, "embedding_provider", None),
            "reranker_provider": getattr(settings, "reranker_provider", None),
            "store": "postgres/pgvector",
            "query_hash": hashlib.sha256(query.encode("utf-8")).hexdigest()[:12],
            "user_id_masked": _mask_user(uid),
            "filters_env": {k: v for k, v in env_inv.items()},
            "rerank_enabled": do_rerank,
        },
        "inventory": {
            "total_chunks_scanned": total_chunks,
            "truncated_at_cap": truncated,
            "chunks_containing_fsh": len(fsh_chunks),
            "fsh_chunks": fsh_chunks,
        },
        "retrieval_unfiltered": {
            "candidate_count": len(ret_a),
            "stats": stats_a,
            "fsh_candidate_ranks": fsh_retrieved_a,
            "top_candidates": [
                {
                    "retrieval_rank": i,
                    "chunk_id": c["chunk_id"],
                    "document_id": c["document_id"],
                    "doc_type": c["doc_type"],
                    "section": c.get("section"),
                    "page": c.get("page"),
                    "similarity": c.get("similarity"),
                    "score": c.get("score"),
                    "text_length": len(c.get("chunk_text") or ""),
                    "fsh": bool(_FSH_ABBREV_RE.search(c.get("chunk_text") or ""))
                    or bool(_FSH_FULL_RE.search(c.get("chunk_text") or "")),
                    "noise_flagged": _is_noisy(c.get("section"), c.get("chunk_text") or ""),
                }
                for i, c in enumerate(ret_a[:10])
            ],
        },
        "retrieval_filtered": (
            {
                "filters": env_inv,
                "candidate_count": len(ret_b),
                "stats": stats_b,
                "fsh_candidate_ranks": fsh_retrieved_b,
            }
            if ret_b is not None
            else None
        ),
        "rerank": rerank_result,
    }

    # ------------------------------------------------- stage summary (facts)
    stage = []
    if not fsh_chunks:
        stage.append(
            "NO chunk for this user contains FSH text (fields: section/text). "
            "Evidence absent at extraction or indexing, or the document belongs to a different user_id."
        )
    else:
        any_retrieved = bool(fsh_retrieved_a)
        stage.append(f"FSH text present in {len(fsh_chunks)} indexed chunk(s).")
        if not any_retrieved:
            stage.append(
                "FSH chunks were NOT returned by the unfiltered production-equivalent retrieval - lost at retrieval."
            )
        else:
            ranks = [e["retrieval_rank"] for e in fsh_retrieved_a]
            top_is_fsh = bool(
                ret_a
                and (
                    bool(_FSH_ABBREV_RE.search(ret_a[0].get("chunk_text") or ""))
                    or bool(_FSH_FULL_RE.search(ret_a[0].get("chunk_text") or ""))
                )
            )
            stage.append(
                f"FSH chunk retrieved at retrieval rank(s) {sorted(ranks)}; top candidate is "
                f"{'FSH' if top_is_fsh else 'NOT FSH'}."
            )
            if do_rerank and rerank_result.get("performed"):
                rk = rerank_result["fsh_entries"]
                if rk:
                    stage.append(
                        "FSH chunk rerank rank/score: "
                        + ", ".join(f"rank {e['rerank_rank']} score {e['rerank_score']}" for e in rk)
                        + "."
                    )
                stage.append(
                    "Top reranked candidate: " + json.dumps(rerank_result.get("top_candidate"), sort_keys=True) + "."
                )
    if env_inv:
        if fsh_retrieved_b:
            stage.append("FSH chunk ALSO retrieved under the supplied document filters.")
        else:
            stage.append("FSH chunk NOT retrieved under the supplied document filters - check document_id/doc_type.")
    report["stage_summary"] = stage

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as fh:
        json.dump(report, fh, indent=2, ensure_ascii=False)

    # -------------------------------------------------------------- stdout summary (redacted)
    print("=" * 72)
    print("MedTracker RAG read-only FSH diagnostic")
    print(f"  output file : {output_path}")
    print(f"  user        : {_mask_user(uid)}")
    print(f"  chunks      : {total_chunks}{'  (TRUNCATED >10000)' if truncated else ''}  |  contain FSH: {len(fsh_chunks)}")
    print(f"  retrieval   : {len(ret_a)} candidates (top_n={getattr(settings, 'rerank_top_n', 30)}) unfiltered")
    if ret_b is not None:
        print(f"  filtered    : {len(ret_b)} candidates (filters={env_inv})")
    if fsh_retrieved_a:
        print(f"  FSH retrieved (unfiltered): ranks {[e['retrieval_rank'] for e in fsh_retrieved_a]}")
    else:
        print("  FSH retrieved (unfiltered): NONE")
    if do_rerank and rerank_result.get("performed"):
        print(
            "  rerank      : performed; top candidate = "
            + json.dumps(rerank_result.get("top_candidate"), sort_keys=True)
        )
        print(f"  FSH rerank  : {rerank_result['fsh_entries'] if rerank_result['fsh_entries'] else 'not in top_k'}")
    if rerank_result.get("error"):
        print(f"  rerank      : skipped ({rerank_result['error']})")
    print("-" * 72)
    for line in report["stage_summary"]:
        print(f"  {line}")
    print("=" * 72)
    print("Full redacted JSON written to", output_path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())