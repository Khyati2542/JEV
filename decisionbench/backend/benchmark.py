"""Benchmark engine.

Fairness rules enforced here:
  * every method sees the same tickets, in the same order, with the same text;
  * every method sees the same decision space in the same order;
  * the same model and the same server serve all LLM methods;
  * the same human-review thresholds are applied to every method;
  * nothing is estimated. A metric that cannot be measured is reported as null
    and rendered as "N/A".

Accuracy is `correct / total`, where a parse failure counts as not-correct -
failing to produce a usable answer is a real outcome, not a missing value.
"""
from __future__ import annotations

import statistics
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Iterable, List, Optional

from . import dataset
from .config import AUTO_DECIDE_MIN_MARGIN, AUTO_DECIDE_MIN_TOP, MODEL_NAME, RUNS_DIR
from .runner import decide
from .schemas import BenchmarkRequest, BenchmarkResponse, MethodSummary

DIFFICULTIES = ["easy", "medium", "hard"]


def _mean(values: Iterable[float]) -> Optional[float]:
    vals = [v for v in values if v is not None]
    return round(statistics.fmean(vals), 3) if vals else None


def _pct(values: List[float], q: float) -> Optional[float]:
    if not values:
        return None
    ordered = sorted(values)
    idx = min(len(ordered) - 1, max(0, int(round(q * (len(ordered) - 1)))))
    return round(ordered[idx], 3)


def summarise(method: str, rows: List[Dict[str, Any]]) -> MethodSummary:
    total = len(rows)
    latencies = [r["latency_ms"] for r in rows if r.get("latency_ms") is not None]
    token_rows = [r["generated_tokens"] for r in rows if r.get("generated_tokens") is not None]
    conf_rows = [r["confidence"] for r in rows if r.get("confidence") is not None]
    review_rows = [r["needs_human_review"] for r in rows if r.get("needs_human_review") is not None]

    correct = sum(1 for r in rows if r.get("correct") is True)
    decided = sum(1 for r in rows if r.get("decision"))
    parse_failures = sum(1 for r in rows if not r.get("parse_ok", True))

    by_difficulty: Dict[str, Optional[float]] = {}
    for level in DIFFICULTIES:
        subset = [r for r in rows if r.get("difficulty") == level]
        by_difficulty[level] = (
            round(sum(1 for r in subset if r.get("correct") is True) / len(subset), 4) if subset else None
        )

    return MethodSummary(
        method=method,  # type: ignore[arg-type]
        engine_label=rows[0]["engine_label"] if rows else "",
        mode=rows[0]["mode"] if rows else "demo",  # type: ignore[arg-type]
        total=total,
        decided=decided,
        parse_failures=parse_failures,
        correct=correct,
        accuracy=round(correct / total, 4) if total else None,
        accuracy_by_difficulty=by_difficulty,
        avg_latency_ms=_mean(latencies),
        p50_latency_ms=_pct(latencies, 0.5),
        p95_latency_ms=_pct(latencies, 0.95),
        avg_generated_tokens=_mean(token_rows) if token_rows else None,
        total_generated_tokens=int(sum(token_rows)) if token_rows else None,
        avg_confidence=_mean(conf_rows) if conf_rows else None,
        human_review_rate=(round(sum(1 for v in review_rows if v) / len(review_rows), 4) if review_rows else None),
        human_review_count=(sum(1 for v in review_rows if v) if review_rows else None),
        low_confidence_cases=(sum(1 for c in conf_rows if c < 0.5) if conf_rows else None),
        confidence_available=bool(conf_rows),
    )


async def run_benchmark(req: BenchmarkRequest) -> BenchmarkResponse:
    run_id = f"run_{uuid.uuid4().hex[:10]}"
    started = datetime.now(timezone.utc).isoformat(timespec="seconds")

    tickets = dataset.filtered(difficulty=req.difficulty, limit=req.limit)
    min_top = AUTO_DECIDE_MIN_TOP if req.min_top is None else req.min_top
    min_margin = AUTO_DECIDE_MIN_MARGIN if req.min_margin is None else req.min_margin

    records: List[Dict[str, Any]] = []
    per_method: Dict[str, List[Dict[str, Any]]] = {m: [] for m in req.methods}

    for ticket in tickets:
        for method in req.methods:
            resp = await decide(
                method,
                ticket_id=ticket["id"],
                min_top=min_top,
                min_margin=min_margin,
                run_id=run_id,
            )
            row = {
                "timestamp": resp.timestamp,
                "run_id": run_id,
                "method": method,
                "mode": resp.mode,
                "engine_label": resp.engine_label,
                "ticket_id": ticket["id"],
                "difficulty": ticket["difficulty"],
                "ground_truth": resp.ground_truth,
                "decision": resp.decision,
                "correct": resp.correct,
                "latency_ms": resp.latency_ms,
                "generated_tokens": resp.generated_tokens,
                "confidence": resp.confidence,
                "needs_human_review": resp.needs_human_review,
                "parse_ok": resp.parse_ok,
                "probabilities": resp.probabilities,
            }
            records.append(row)
            per_method[method].append(row)

    modes = {r["mode"] for r in records}
    overall_mode = "live" if modes == {"live"} else ("demo" if "demo" in modes else "live")

    log_path = None
    try:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        log_path = str(RUNS_DIR / f"{run_id}.json")
    except Exception:
        log_path = None

    return BenchmarkResponse(
        run_id=run_id,
        started_at=started,
        finished_at=datetime.now(timezone.utc).isoformat(timespec="seconds"),
        mode=overall_mode,  # type: ignore[arg-type]
        model=MODEL_NAME,
        thresholds={"min_top": min_top, "min_margin": min_margin},
        dataset=dataset.stats(),  # type: ignore[arg-type]
        summaries=[summarise(m, per_method[m]) for m in req.methods],
        records=records,
        log_path=log_path,
    )
