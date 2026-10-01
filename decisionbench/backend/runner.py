"""Single dispatch path shared by the per-request API and the benchmark.

Both routes go through `decide()`, so a one-off click and a 54-ticket benchmark
are measured identically and logged identically.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from . import dataset
from .config import (
    AUTO_DECIDE_MIN_MARGIN,
    AUTO_DECIDE_MIN_TOP,
    FORCE_DEMO,
    MODEL_NAME,
    RUNS_DIR,
)
from .engines import classifier, demo, jev_scorer, normal_llm, structured
from .engines.base import EngineResult, EngineUnavailable, apply_policy, probe_server
from .schemas import DecisionResponse

LIVE_ENGINES = {
    "normal": normal_llm.run,
    "structured": structured.run,
    "jev": jev_scorer.run,
}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="milliseconds")


async def current_mode() -> str:
    """'demo' when forced, or when no local model server answers."""
    if FORCE_DEMO:
        return "demo"
    status = await probe_server()
    return "live" if status["reachable"] else "demo"


def _log(record: Dict[str, Any]) -> Optional[str]:
    try:
        RUNS_DIR.mkdir(parents=True, exist_ok=True)
        path = RUNS_DIR / "decisions.jsonl"
        with open(path, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(record, ensure_ascii=False) + "\n")
        return str(path)
    except Exception:
        return None


async def decide(
    method: str,
    *,
    text: Optional[str] = None,
    ticket_id: Optional[str] = None,
    min_top: Optional[float] = None,
    min_margin: Optional[float] = None,
    run_id: Optional[str] = None,
) -> DecisionResponse:
    ticket = dataset.get(ticket_id) if ticket_id else None
    if ticket is None and ticket_id:
        raise KeyError(f"unknown ticket id {ticket_id!r}")

    body = (text if text is not None else (ticket or {}).get("text", "")) or ""
    if not body.strip():
        raise ValueError("either `text` or a valid `ticket_id` is required")

    min_top = AUTO_DECIDE_MIN_TOP if min_top is None else min_top
    min_margin = AUTO_DECIDE_MIN_MARGIN if min_margin is None else min_margin

    result: EngineResult
    fallback_note: Optional[str] = None

    if method == "classifier":
        # Runs locally; never needs the model server, so never enters demo mode.
        result = await classifier.run(body, ticket_id)
    else:
        mode = await current_mode()
        if mode == "demo":
            result = await demo.run(method, body, ticket_id)
            if FORCE_DEMO:
                fallback_note = "FORCE_DEMO=1 is set in the environment."
        else:
            try:
                result = await LIVE_ENGINES[method](body)
            except EngineUnavailable as exc:
                result = await demo.run(method, body, ticket_id)
                fallback_note = f"Live inference failed and demo output was substituted: {exc}"

    needs_review, review_reason = apply_policy(result.probabilities, min_top, min_margin)
    if result.probabilities is None and result.decision is None and not result.parse_ok:
        review_reason = "Output could not be parsed, so no decision was produced."

    ground_truth = ticket["category"] if ticket else None
    correct = (result.decision == ground_truth) if ground_truth else None

    note = result.note
    if fallback_note:
        note = f"{fallback_note} {note or ''}".strip()

    response = DecisionResponse(
        method=method,  # type: ignore[arg-type]
        engine_label=result.engine_label,
        mode=result.mode,  # type: ignore[arg-type]
        simulated=result.simulated,
        ticket_id=ticket_id,
        decision=result.decision,
        latency_ms=round(result.latency_ms, 3),
        generated_tokens=result.generated_tokens,
        prompt_tokens=result.prompt_tokens,
        probabilities=(
            {k: round(v, 6) for k, v in result.probabilities.items()} if result.probabilities else None
        ),
        confidence=round(result.confidence, 6) if result.confidence is not None else None,
        confidence_source=result.confidence_source,
        needs_human_review=needs_review,
        review_reason=review_reason,
        thresholds={"min_top": min_top, "min_margin": min_margin},
        parse_ok=result.parse_ok,
        raw_output=result.raw_output,
        note=note,
        error=result.error,
        ground_truth=ground_truth,
        difficulty=ticket["difficulty"] if ticket else None,
        ground_truth_reason=ticket["reason"] if ticket else None,
        correct=correct,
        timestamp=_now(),
    )

    _log(
        {
            "timestamp": response.timestamp,
            "run_id": run_id,
            "method": method,
            "mode": response.mode,
            # Only the LLM-backed methods actually use the model; recording it
            # for the local classifier would misattribute the result.
            "model": MODEL_NAME if (response.mode == "live" and method in LIVE_ENGINES) else None,
            "ticket_id": ticket_id,
            "prediction": response.decision,
            "ground_truth": ground_truth,
            "correct": correct,
            "latency_ms": response.latency_ms,
            "confidence": response.confidence,
            "generated_tokens": response.generated_tokens,
            "prompt_tokens": response.prompt_tokens,
            "parse_ok": response.parse_ok,
            "needs_human_review": response.needs_human_review,
            "thresholds": response.thresholds,
            "engine_label": response.engine_label,
        }
    )
    return response
