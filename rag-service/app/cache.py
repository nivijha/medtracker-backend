"""Multi-level cache for RAG query responses.

Cache key (per ADR-020 / MODIFY #3): `rag:{userId}:{indexVersion}:{queryHash}`.
Uses Redis when configured; otherwise falls back to an in-process store so the
service stays functional in offline/test environments. Bumping `index_version`
invalidates all cached entries for a user (simple, explicit invalidation).
"""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional, Protocol

from .config import settings

CACHE_PREFIX = "rag"

# Memoized default instance so the in-process cache persists across requests
# when Redis is not configured.
_default_cache: CacheStore | None = None


class CacheStore(Protocol):
    def get(self, key: str) -> Optional[dict]: ...
    def set(self, key: str, value: dict, ttl: int) -> None: ...
    def invalidate_user(self, user_id: str) -> None: ...


class InMemoryCache:
    """Process-local cache (also the offline/test fallback)."""

    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    def get(self, key: str) -> Optional[dict]:
        raw = self._store.get(key)
        return json.loads(raw) if raw is not None else None

    def set(self, key: str, value: dict, ttl: int = 0) -> None:
        self._store[key] = json.dumps(value)

    def invalidate_user(self, user_id: str) -> None:
        prefix = f"{CACHE_PREFIX}:{user_id}:"
        for key in [key for key in self._store if key.startswith(prefix)]:
            del self._store[key]


class RedisCache:
    """Redis-backed cache. `redis` is imported lazily so the dependency is optional."""

    def __init__(self, url: str) -> None:
        self._url = url
        self._client = None

    def _ensure(self):
        if self._client is None:
            import redis

            self._client = redis.from_url(self._url, decode_responses=True)
        return self._client

    def get(self, key: str) -> Optional[dict]:
        raw = self._ensure().get(key)
        return json.loads(raw) if raw else None

    def set(self, key: str, value: dict, ttl: int = 3600) -> None:
        self._ensure().set(key, json.dumps(value), ex=ttl if ttl else None)

    def invalidate_user(self, user_id: str) -> None:
        client = self._ensure()
        prefix = f"{CACHE_PREFIX}:{user_id}:"
        keys = list(client.scan_iter(match=f"{prefix}*"))
        if keys:
            client.delete(*keys)


def make_cache_key(user_id: str, index_version: str, query: str, filters: dict | None = None) -> str:
    query_hash = hashlib.sha256(query.strip().lower().encode("utf-8")).hexdigest()[:16]
    filter_json = json.dumps(filters or {}, sort_keys=True, separators=(",", ":"))
    filter_hash = hashlib.sha256(filter_json.encode("utf-8")).hexdigest()[:16]
    return f"{CACHE_PREFIX}:{user_id}:{index_version}:{query_hash}:{filter_hash}"


def get_default_cache() -> CacheStore:
    global _default_cache
    if _default_cache is not None:
        return _default_cache
    if settings.redis_url:
        try:
            _default_cache = RedisCache(settings.redis_url)
            return _default_cache
        except Exception:
            _default_cache = InMemoryCache()
            return _default_cache
    _default_cache = InMemoryCache()
    return _default_cache
