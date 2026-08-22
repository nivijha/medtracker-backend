"""Generation client: interface + Express-backed implementation + mock.

FastAPI delegates grounded generation to the existing Express endpoint
POST /api/ai/generate (which reuses the LLaMA -> Gemini fallback). This keeps the
single source of truth for generation in Node and only adds a thin HTTP client here.
"""
from __future__ import annotations

from typing import Protocol


class GenerationClient(Protocol):
    def generate(self, system_prompt: str, user_prompt: str) -> str: ...


class ExpressGenerationClient:
    def __init__(self, base_url: str, secret: str, timeout_s: float = 20.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._secret = secret
        self._timeout_s = timeout_s

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        import json

        # Lazy import so the module is importable without `requests`/http libs in tests.
        try:
            import urllib.request

            req = urllib.request.Request(
                f"{self._base_url}/api/ai/generate",
                data=json.dumps({"systemPrompt": system_prompt, "userPrompt": user_prompt}).encode(),
                headers={"Content-Type": "application/json", "X-Rag-Service-Secret": self._secret},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=self._timeout_s) as resp:
                payload = json.loads(resp.read().decode())
            text = payload.get("text")
            if not text:
                raise RuntimeError("Empty generation response")
            return text
        except Exception as e:  # network/HTTP failures surface to caller for abstention
            raise RuntimeError(f"generation request failed: {e}") from e


class MockGenerationClient:
    def __init__(self, answer: str = "MOCK ANSWER") -> None:
        self.answer = answer
        self.last_call = None

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        self.last_call = (system_prompt, user_prompt)
        return self.answer


def get_default_generation_client() -> GenerationClient:
    from .config import settings

    if not settings.express_ai_url:
        raise RuntimeError("express_ai_url is not configured; generation unavailable")
    return ExpressGenerationClient(settings.express_ai_url, settings.rag_service_secret)
