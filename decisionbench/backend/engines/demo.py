"""Demo mode - used only when no local model server is reachable.

Rules this module follows, without exception:

  * Demo output is NEVER presented as a model measurement. Every response is
    tagged mode="demo", simulated=True, and the UI banners it.
  * Nothing is fabricated to make any method look good. All demo methods share
    one deterministic local heuristic, so they mostly agree with each other.
  * Latency is the genuinely measured time of the local heuristic (sub-
    millisecond). It is NOT a simulated model latency, and the benchmark view
    suppresses latency/token charts in demo mode.
  * Generated-token counts are reported as null -> "N/A", because no tokens
    were generated.

The heuristic is deterministic: the same text always produces the same answer.
It is deliberately imperfect, so ambiguous tickets land near the decision
boundary and exercise the human-review path.
"""
from __future__ import annotations

import hashlib
from typing import Dict, Optional

from ..config import CATEGORIES
from .base import EngineResult, measure, restricted_softmax
from .classifier import keyword_scores

DEMO_NOTE = (
    "DEMO MODE - no local model was reachable. This value was produced by a "
    "deterministic local heuristic, not by Qwen. It is not a model measurement."
)


def _jitter(text: str, category: str) -> float:
    """Deterministic pseudo-noise in [-0.55, 0.55] keyed on (text, category)."""
    digest = hashlib.sha256(f"{category}::{text}".encode("utf-8")).digest()
    value = int.from_bytes(digest[:4], "big") / 0xFFFFFFFF
    return (value - 0.5) * 1.1


def demo_probabilities(text: str) -> Dict[str, float]:
    scores = keyword_scores(text)
    logits = {c: scores.get(c, 0.0) / 1.45 + _jitter(text, c) for c in CATEGORIES}
    return restricted_softmax(logits)


def _result(
    method: str,
    text: str,
    *,
    with_probabilities: bool,
    engine_label: str,
    extra_note: str = "",
) -> EngineResult:
    elapsed = measure()
    probs = demo_probabilities(text)
    latency_ms = elapsed()
    decision = max(probs, key=probs.get)

    note = DEMO_NOTE
    if extra_note:
        note = f"{note} {extra_note}"

    return EngineResult(
        decision=decision,
        latency_ms=latency_ms,
        engine_label=engine_label,
        mode="demo",
        simulated=True,
        generated_tokens=None,
        prompt_tokens=None,
        probabilities=probs if with_probabilities else None,
        confidence=probs[decision] if with_probabilities else None,
        confidence_source="demo heuristic" if with_probabilities else "none",
        parse_ok=True,
        raw_output=('{"category": "%s"}' % decision) if not with_probabilities else None,
        note=note,
        extra={"demo": True},
    )


async def run(method: str, text: str, ticket_id: Optional[str] = None) -> EngineResult:
    if method == "jev":
        return _result(
            method,
            text,
            with_probabilities=True,
            engine_label="DEMO - Jev-style scoring (deterministic stand-in)",
            extra_note=(
                "The distribution shape illustrates the UI; it is not a restricted softmax "
                "over real Qwen logits."
            ),
        )
    if method == "structured":
        return _result(
            method,
            text,
            with_probabilities=False,
            engine_label="DEMO - structured output (deterministic stand-in)",
        )
    return _result(
        method,
        text,
        with_probabilities=False,
        engine_label="DEMO - normal LLM generation (deterministic stand-in)",
    )
