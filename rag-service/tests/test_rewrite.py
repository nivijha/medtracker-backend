from app.rewrite import is_context_dependent, rewrite_query


def test_self_contained_query_not_rewritten():
    q = "What is the dosage of metformin?"
    assert rewrite_query(q, "previous question") == q
    assert not is_context_dependent(q)


def test_context_dependent_query_rewritten_with_previous():
    q = "What about its side effects?"
    prev = "What is the dosage of metformin?"
    out = rewrite_query(q, prev)
    assert out == "What is the dosage of metformin? What about its side effects?"
    assert is_context_dependent(q)


def test_no_previous_query_passes_through():
    q = "What about its side effects?"
    assert rewrite_query(q, None) == q
    assert rewrite_query(q, "   ") == q
