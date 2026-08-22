from eval.metrics import (
    faithfulness_proxy,
    mrr,
    ndcg_at_k,
    precision_at_k,
    recall_at_k,
)


def test_recall_precision_at_k():
    retrieved = ["a", "b", "c", "d"]
    relevant = {"b", "d"}
    assert recall_at_k(retrieved, relevant, 2) == 0.5  # only b in top-2
    assert recall_at_k(retrieved, relevant, 4) == 1.0
    assert precision_at_k(retrieved, relevant, 2) == 0.5
    assert precision_at_k(retrieved, relevant, 4) == 0.5


def test_mrr():
    assert mrr(["x", "b", "d"], ["b", "d"]) == 0.5  # first relevant at rank 2
    assert mrr(["b"], ["b", "d"]) == 1.0
    assert mrr(["x", "y"], ["b"]) == 0.0


def test_ndcg_at_k():
    retrieved = ["a", "b", "c"]
    relevant = {"b"}
    assert 0.0 < ndcg_at_k(retrieved, relevant, 3) <= 1.0
    assert ndcg_at_k(retrieved, set(), 3) == 0.0


def test_faithfulness_proxy():
    answer = "Metformin 500 mg is the starting dose. It causes diarrhea."
    contexts = ["The starting dose of metformin is 500 mg with meals.", "Common side effects include diarrhea."]
    score = faithfulness_proxy(answer, contexts)
    assert 0.0 <= score <= 1.0
    # Both sentences are supported by the contexts.
    assert score == 1.0


def test_faithfulness_proxy_unsupported():
    answer = "Xyz abc def ghi jkl mno pqr."
    contexts = ["Metformin 500 mg is the starting dose."]
    assert faithfulness_proxy(answer, contexts, threshold=0.1) == 0.0
