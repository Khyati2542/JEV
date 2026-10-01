"""Mode 4 - traditional classifier baseline.

Two backends, chosen automatically. Both are clearly labelled in the UI so the
numbers are never mistaken for a tuned production classifier.

  sklearn  TF-IDF + multinomial logistic regression trained on this very
           dataset. Because the dataset has only ~54 rows, training and
           evaluating on it would be meaningless, so benchmark predictions are
           made OUT OF FOLD: each ticket is scored by a model from a 5-fold
           split that never saw that ticket. Free-text typed into the UI is
           scored by a model fitted on all rows.

  keyword  A hand-written weighted keyword baseline with no training at all.
           Used when scikit-learn is not installed. Honest floor, not a
           competitor.

This is the one engine that never needs the model server, so it never enters
demo mode.
"""
from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from ..config import CATEGORIES
from .. import dataset
from .base import EngineResult, measure, normalise, restricted_softmax

# ---------------------------------------------------------------------------
# Keyword baseline (no dependencies, no training)
# ---------------------------------------------------------------------------
LEXICON: Dict[str, List[Tuple[str, float]]] = {
    "Billing": [
        ("invoice", 2.4), ("invoiced", 2.4), ("billing", 2.4), ("billed", 2.2),
        ("charge", 2.0), ("charged", 2.0), ("refund", 2.0), ("receipt", 2.0),
        ("payment", 1.6), ("pay", 1.0), ("paid", 0.9), ("card", 1.1),
        ("subscription", 1.0), ("price", 1.5), ("pricing", 1.5), ("cost", 1.2),
        ("overdue", 1.6), ("gst", 1.6), ("currency", 1.3), ("pro-rated", 1.3),
        ("plan", 0.7), ("renewal", 0.8), ("amount", 1.0), ("bank", 1.2),
        ("downgrade", 0.6), ("upgrade", 0.6),
    ],
    "Technical": [
        ("crash", 2.4), ("crashes", 2.4), ("error", 1.6), ("bug", 2.0),
        ("502", 2.0), ("500", 1.6), ("timeout", 1.8), ("spinner", 1.8),
        ("endpoint", 1.6), ("api", 1.2), ("webhook", 2.0), ("webhooks", 2.0),
        ("upload", 1.4), ("export", 1.2), ("dashboard", 0.9), ("browser", 1.6),
        ("safari", 1.6), ("chrome", 1.4), ("firefox", 1.4), ("cache", 1.2),
        ("refresh", 1.2), ("loading", 1.4), ("broken", 1.4), ("fails", 1.4),
        ("failing", 1.4), ("not working", 1.4), ("sync", 1.2), ("timestamps", 1.6),
        ("0 bytes", 2.0), ("redirect", 1.2),
    ],
    "Account": [
        ("profile", 2.0), ("settings", 1.6), ("rename", 1.8), ("workspace", 1.2),
        ("member", 1.6), ("members", 1.6), ("admin", 1.4), ("invite", 1.6),
        ("invitation", 1.6), ("ownership", 2.0), ("transfer", 1.6),
        ("permission", 1.4), ("permissions", 1.4), ("role", 1.4),
        ("delete my account", 2.4), ("merge", 1.8), ("consolidat", 1.8),
        ("email address", 1.6), ("organisation", 1.4), ("organization", 1.4),
        ("seat", 0.8), ("sign up", 1.0), ("signed up", 1.0),
    ],
    "Security": [
        ("compromised", 2.8), ("hacked", 2.8), ("unauthorised", 2.6),
        ("unauthorized", 2.6), ("suspicious", 2.2), ("breach", 2.6),
        ("unfamiliar", 2.2), ("don't recognize", 2.2), ("do not recognize", 2.2),
        ("didn't request", 2.4), ("did not request", 2.4), ("leak", 2.0),
        ("audit log", 1.8), ("api key", 1.4), ("credential", 1.8),
        ("two-factor", 1.6), ("2fa", 1.6), ("phishing", 2.4),
        ("login notification", 2.0), ("exposed", 2.0), ("revoked", 1.4),
        ("password reset", 1.2), ("https", 1.4), ("tls", 1.6),
    ],
    "Other": [
        ("office", 2.0), ("working hours", 2.2), ("hiring", 2.4), ("careers", 2.4),
        ("roadmap", 2.2), ("case study", 2.4), ("documentation", 1.4),
        ("interview", 2.2), ("dissertation", 2.4), ("student", 1.8),
        ("acquired", 2.0), ("legal", 1.8), ("contract", 1.2), ("procurement", 1.2),
        ("questionnaire", 1.6), ("partnership", 2.0), ("discount", 1.4),
        ("who should i talk to", 2.2), ("nda", 1.8),
    ],
}

_WORD_RE = re.compile(r"[a-z0-9']+")


def keyword_scores(text: str) -> Dict[str, float]:
    """Weighted keyword match score per category. Not a probability."""
    low = " " + re.sub(r"\s+", " ", text.lower()) + " "
    scores: Dict[str, float] = {}
    for category, terms in LEXICON.items():
        total = 0.0
        for term, weight in terms:
            hits = low.count(term)
            if hits:
                total += weight * (1.0 + 0.35 * min(hits - 1, 3))
        scores[category] = total
    # When nothing matched anywhere, the request is genuinely off-taxonomy.
    if max(scores.values(), default=0.0) < 0.9:
        scores["Other"] += 1.6
    return scores


def keyword_probabilities(text: str, temperature: float = 1.35) -> Dict[str, float]:
    scores = keyword_scores(text)
    logits = {c: scores.get(c, 0.0) / max(temperature, 1e-6) for c in CATEGORIES}
    return restricted_softmax({k: float(v) for k, v in logits.items()})


# ---------------------------------------------------------------------------
# scikit-learn backend
# ---------------------------------------------------------------------------
N_SPLITS = 5


class SklearnBaseline:
    label = (
        "TF-IDF + logistic regression, trained on this 54-row dataset "
        f"(benchmark predictions are out-of-fold, {N_SPLITS}-fold)"
    )

    def __init__(self) -> None:
        from sklearn.feature_extraction.text import TfidfVectorizer  # noqa: F401
        from sklearn.linear_model import LogisticRegression  # noqa: F401
        from sklearn.model_selection import StratifiedKFold
        from sklearn.pipeline import make_pipeline

        rows = dataset.all_tickets()
        self.ids = [r["id"] for r in rows]
        X = [r["text"] for r in rows]
        y = [r["category"] for r in rows]

        self.full = self._new_pipeline(make_pipeline).fit(X, y)

        self.fold_models: List[Any] = []
        self.ticket_fold: Dict[str, int] = {}
        try:
            skf = StratifiedKFold(n_splits=N_SPLITS, shuffle=True, random_state=42)
            for fold, (train_idx, test_idx) in enumerate(skf.split(X, y)):
                model = self._new_pipeline(make_pipeline).fit(
                    [X[i] for i in train_idx], [y[i] for i in train_idx]
                )
                self.fold_models.append(model)
                for i in test_idx:
                    self.ticket_fold[self.ids[i]] = fold
        except Exception:
            # Not enough examples per class to split: fall back to the full model.
            self.fold_models = []
            self.ticket_fold = {}

    @staticmethod
    def _new_pipeline(make_pipeline):
        from sklearn.feature_extraction.text import TfidfVectorizer
        from sklearn.linear_model import LogisticRegression

        return make_pipeline(
            TfidfVectorizer(ngram_range=(1, 2), sublinear_tf=True, min_df=1, lowercase=True),
            LogisticRegression(max_iter=2000, C=4.0, class_weight="balanced"),
        )

    def predict(self, text: str, ticket_id: Optional[str]) -> Tuple[Dict[str, float], str]:
        held_out = ticket_id is not None and ticket_id in self.ticket_fold
        model = self.fold_models[self.ticket_fold[ticket_id]] if held_out else self.full
        proba = model.predict_proba([text])[0]
        classes = list(model.classes_)
        probs = {c: 0.0 for c in CATEGORIES}
        for cls, p in zip(classes, proba):
            probs[str(cls)] = float(p)
        detail = (
            f"out-of-fold model (fold {self.ticket_fold[ticket_id]}, never trained on {ticket_id})"
            if held_out
            else "model fitted on all 54 rows (free-text input, not a held-out measurement)"
        )
        return normalise(probs), detail


_backend: Any = None
_backend_kind = "unloaded"


def backend() -> Tuple[Any, str]:
    global _backend, _backend_kind
    if _backend_kind != "unloaded":
        return _backend, _backend_kind
    try:
        _backend = SklearnBaseline()
        _backend_kind = "sklearn"
    except Exception:
        _backend = None
        _backend_kind = "keyword"
    return _backend, _backend_kind


def backend_name() -> str:
    return backend()[1]


async def run(text: str, ticket_id: Optional[str] = None) -> EngineResult:
    model, kind = backend()

    if kind == "sklearn":
        elapsed = measure()
        probs, detail = model.predict(text, ticket_id)
        latency_ms = elapsed()
        label = SklearnBaseline.label
        note = (
            f"Baseline classifier - {detail}. A 54-row training set is far too small for a "
            "production classifier; this is included as a reference point, not as a tuned system."
        )
    else:
        elapsed = measure()
        probs = keyword_probabilities(text)
        latency_ms = elapsed()
        label = "Keyword heuristic baseline (no training, no model)"
        note = (
            "BASELINE ONLY - hand-written keyword weights, not a trained classifier. "
            "Install scikit-learn to use the TF-IDF + logistic regression backend."
        )

    decision = max(probs, key=probs.get)
    return EngineResult(
        decision=decision,
        latency_ms=latency_ms,
        engine_label=label,
        generated_tokens=0,
        prompt_tokens=None,
        probabilities=probs,
        confidence=probs[decision],
        confidence_source=f"{kind} predicted probability",
        parse_ok=True,
        note=note,
        extra={"backend": kind},
    )
