"""Offline smoke test: load the baked CrossEncoder model exactly as the Lambda
handler does (same constructor args), run a real inference, and verify:
- scores are returned for >=2 candidates
- ordering is deterministic for identical input
- no Hugging Face network request occurs (offline env vars + local_files_only,
  model loads purely from /opt/models)
- inference completes well within the Lambda timeout budget
"""
import os
import time

os.environ["HF_HOME"] = "/tmp/hf_cache"
os.environ["TRANSFORMERS_OFFLINE"] = "1"
os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["HF_DATASETS_OFFLINE"] = "1"

MODEL_PATH = "/opt/models/ms-marco-MiniLM-L-6-v2"
REQUIRED_MODEL_FILES = (
    "config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "vocab.txt",
)
LAMBDA_TIMEOUT_BUDGET_S = 60


def _run():
    missing = [f for f in REQUIRED_MODEL_FILES if not os.path.isfile(os.path.join(MODEL_PATH, f))]
    assert not missing, f"model directory missing required files: {missing}"
    assert os.path.isfile(os.path.join(MODEL_PATH, "model.safetensors")) or os.path.isfile(
        os.path.join(MODEL_PATH, "pytorch_model.bin")
    ), "model weights missing"

    t_start = time.time()
    from sentence_transformers import CrossEncoder

    # Same call signature as aws-rerank/app.py._load_model().
    m = CrossEncoder(MODEL_PATH, device="cpu", local_files_only=True)
    t_init = time.time()
    pairs = [
        ("What medication is the patient taking?", "The patient takes metformin 500 mg once daily."),
        ("What medication is the patient taking?", "Radiology report shows no acute findings."),
    ]
    first = [float(s) for s in m.predict(pairs)]
    second = [float(s) for s in m.predict(pairs)]
    t_done = time.time()

    assert len(first) == 2, f"expected 2 scores, got {len(first)}"
    assert first == second, f"nondeterministic scores: {first} vs {second}"
    assert all(isinstance(s, float) for s in first)
    assert any(a != b for a, b in zip(first, second)) or (first[0] != first[1]), "candidates must be distinguishable"

    total_s = t_done - t_start
    assert total_s < LAMBDA_TIMEOUT_BUDGET_S, f"inference too slow: {total_s:.2f}s"

    print("OFFLINE SMOKE TEST OK scores=", [round(s, 6) for s in first])
    print(
        f"deterministic=True candidates=2 init_ms={int((t_init - t_start) * 1000)} "
        f"predict_ms={int((t_done - t_init) * 1000)} total_ms={int(total_s * 1000)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(_run())