from __future__ import annotations

from typing import Protocol


class GenerationClient(Protocol):
    def generate(self, system_prompt: str, user_prompt: str) -> str: ...


class ExpressGenerationClient:
    def __init__(self, base_url: str, secret: str, timeout_s: float = 25.0) -> None:
        raw = base_url.rstrip("/")
        if raw.endswith("/api/ai/generate"):
            raw = raw[: -len("/api/ai/generate")]
        elif raw.endswith("/api/ai"):
            raw = raw[: -len("/api/ai")]
        self._base_url = raw.rstrip("/")
        self._secret = secret
        self._timeout_s = timeout_s

    def generate(self, system_prompt: str, user_prompt: str) -> str:
        import json

        try:
            import urllib.request
            import urllib.error

            req = urllib.request.Request(
                f"{self._base_url}/api/ai/generate",
                data=json.dumps({"systemPrompt": system_prompt, "userPrompt": user_prompt}).encode(),
                headers={"Content-Type": "application/json", "X-Rag-Service-Secret": self._secret},
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=self._timeout_s) as resp:
                    payload = json.loads(resp.read().decode())
            except urllib.error.HTTPError as he:
                body = he.read().decode()[:800] if he.fp else ""
                raise RuntimeError(f"Express generation HTTP {he.code}: {body}") from he
            text = payload.get("text") or payload.get("reply") or payload.get("answer")
            if not text or not str(text).strip():
                raise RuntimeError(f"Empty generation response: {str(payload)[:800]}")
            return str(text).strip()
        except RuntimeError:
            raise
        except Exception as e:
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
