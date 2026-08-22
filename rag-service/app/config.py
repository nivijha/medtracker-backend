from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Internal service secret (Express -> FastAPI)
    rag_service_secret: str = ""

    # Connection to the Express backend that owns generation (LLaMA -> Gemini)
    express_ai_url: str = "http://localhost:5000/api/ai/generate"

    # PostgreSQL + pgvector. If empty, the service falls back to an in-memory store.
    # `pg_rag_database_url` (env PG_RAG_DATABASE_URL) takes precedence when set.
    database_url: str = ""
    pg_rag_database_url: str = ""

    redis_url: str = ""

    # Embedding model (local sentence-transformers). 384-dim for MiniLM.
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"

    # Chunking (initial defaults — validated by experiment, see docs/experiments)
    chunk_size: int = 1500
    chunk_overlap: int = 200

    # Retrieval
    top_k: int = 10
    rrf_k: int = 60  # RRF rank constant

    # Reranking
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    rerank_top_n: int = 30  # candidates sent to the reranker

    # Grounding (initial default — tuned by experiment, see docs/experiments/EXP-006)
    evidence_threshold: float = 0.15

    # Cache + index versioning (ADR-020/021). Bump index_version to invalidate.
    rag_cache_ttl: int = 3600
    index_version: str = "1"

    log_level: str = "INFO"


settings = Settings()
