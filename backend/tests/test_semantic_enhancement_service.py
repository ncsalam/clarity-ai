import pytest

from app.semantic_enhancement_service import SemanticEnhancementService


class DummyLexiconManager:
    def __init__(self, terms):
        self.terms = terms

    def get_lexicon(self, owner_id=None):
        return self.terms


class FakeEmbeddings:
    def __init__(self, vectors):
        self.vectors = vectors

    def embed_query(self, text):
        return self.vectors.get(text.lower(), [0.0, 0.0])


def make_service(vectors, lexicon_terms):
    svc = SemanticEnhancementService(DummyLexiconManager(lexicon_terms))
    svc.embeddings_model = FakeEmbeddings(vectors)
    svc.embeddings_available = True
    svc.clear_cache()
    return svc


def test_semantic_matches_above_threshold():
    vectors = {
        "responsive": [1.0, 0.0],
        "secure": [0.0, 1.0],
        "respond": [0.9, 0.1],  # close to responsive
        "safe": [0.1, 0.9],     # close to secure
        "quickly": [0.5, 0.0],
    }
    service = make_service(vectors, ["responsive", "secure"])

    text = "System should respond quickly and stay safe"
    results = service.find_semantically_similar_terms(text, threshold=0.8)

    # Expect respond->responsive and safe->secure
    matched = {(r["term"], r["matched_lexicon_term"]) for r in results}
    assert ("respond", "responsive") in matched
    assert ("safe", "secure") in matched
    for r in results:
        assert r["detection_method"] == "semantic_similarity"
        assert not r["is_exact_match"]
        assert r["similarity_score"] >= 0.8


def test_excludes_exact_matches_by_default():
    vectors = {
        "responsive": [1.0, 0.0],
    }
    service = make_service(vectors, ["responsive"])

    text = "Responsive systems are reliable"
    results = service.find_semantically_similar_terms(text)

    assert results == []


def test_includes_exact_matches_when_requested():
    vectors = {
        "responsive": [1.0, 0.0],
    }
    service = make_service(vectors, ["responsive"])

    text = "Responsive systems are reliable"
    results = service.find_semantically_similar_terms(text, include_exact_matches=True)

    assert len(results) == 1
    res = results[0]
    assert res["is_exact_match"] is True
    assert res["detection_method"] == "lexicon_exact"
    assert res["similarity_score"] == 1.0


def test_returns_empty_when_embeddings_unavailable():
    service = SemanticEnhancementService(DummyLexiconManager(["responsive"]))
    service.embeddings_available = False

    results = service.find_semantically_similar_terms("any text")

    assert results == []
