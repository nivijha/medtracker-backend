from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    rag_service_secret: str = ""
    express_ai_url: str = "http://localhost:5000"
    database_url: str = ""
    pg_rag_database_url: str = ""
    redis_url: str = ""
    embedding_provider: str = "local"
    embedding_model: str = "sentence-transformers/all-MiniLM-L6-v2"
    embedding_api_url: str = "https://api-inference.huggingface.co"
    embedding_api_key: str = ""
    embedding_connect_timeout: float = 10.0
    embedding_read_timeout: float = 60.0
    embedding_write_timeout: float = 30.0
    embedding_pool_timeout: float = 10.0
    embedding_max_retries: int = 3
    embedding_retry_delay_ms: int = 2000
    embedding_retry_max_delay_ms: int = 4000
    chunk_size: int = 1500
    chunk_overlap: int = 200
    top_k: int = 10
    rrf_k: int = 60
    reranker_model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    rerank_top_n: int = 30
    openrouter_api_key: str = ""
    openrouter_api_url: str = "https://openrouter.ai/api/v1"
    openrouter_model: str = "openai/gpt-4o-mini"
    evidence_threshold: float = 0.15
    rag_cache_ttl: int = 3600
    index_version: str = "2"
    log_level: str = "INFO"


settings = Settings()
