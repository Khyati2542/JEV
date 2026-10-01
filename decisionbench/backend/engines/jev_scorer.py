"""Mode 3 - Jev-style fixed-choice scoring.

    USER REQUEST -> PROMPT -> TOKENIZER -> QWEN -> NEXT-TOKEN LOGITS
                 -> SELECT A/B/C/D/E -> RESTRICTED SOFTMAX -> PROBABILITIES

The model never generates an answer. We run one forward pass, read the logits
at the single position where the answer would have started, keep only the five
single-token labels A/B/C/D/E, and softmax across *those five values only*.

DISCLAIMER: this is a Jev-STYLE mechanism built from open-source components. It
does not reproduce TypeSafe's proprietary Jev model, weights, training process
or evaluation system.

Transport, in order of preference:
  1. SGLang `POST /v1/score` with `label_token_ids` + `apply_softmax`
     -> zero generated tokens; the server returns the restricted distribution.
  2. `POST /v1/completions` with `max_tokens=1, logprobs=k`
     -> read the top-k next-token logprobs and restrict/softmax them ourselves.
     Costs exactly 1 sampled token. Works on SGLang, vLLM and llama.cpp.

Label token ids are resolved via `transformers` if installed, otherwise via a
server-side `/tokenize` route if the server exposes one.
"""
from __future__ import annotations

import math
from typing import Any, Dict, List, Optional

import httpx

from ..config import LABELS, LABEL_TO_CATEGORY, MODEL_NAME, SGLANG_BASE_URL, GEN_BASE_URL
from .base import (
    EngineResult,
    EngineUnavailable,
    get_tokenizer,
    measure,
    normalise,
    post_json,
    render_prompt,
    restricted_softmax,
    scoring_prompt,
)

ENGINE_LABEL = "Jev-style fixed-choice scoring (restricted softmax over A/B/C/D/E)"

_label_token_ids: Optional[List[int]] = None
_label_token_source = "unresolved"
_score_endpoint_state = "unknown"  # unknown | available | unavailable


def score_endpoint_state() -> str:
    return _score_endpoint_state


def label_token_source() -> str:
    return _label_token_source


def _first_token_id_local(label: str) -> Optional[int]:
    tok, state = get_tokenizer()
    if state != "transformers":
        return None
    try:
        ids = tok.encode(label, add_special_tokens=False)
    except Exception:
        return None
    if not ids:
        return None
    if len(ids) > 1:
        # Labels must be single tokens for this mechanism to be exact.
        return None
    return int(ids[0])


async def _first_token_id_server(label: str) -> Optional[int]:
    """vLLM exposes POST /tokenize; SGLang may not. Best-effort only."""
    for base in {GEN_BASE_URL, SGLANG_BASE_URL}:
        try:
            body = await post_json(f"{base}/tokenize", {"model": MODEL_NAME, "prompt": label}, timeout=10)
        except Exception:
            continue
        tokens = body.get("tokens") or body.get("input_ids")
        if isinstance(tokens, list) and len(tokens) == 1 and isinstance(tokens[0], int):
            return int(tokens[0])
    return None


async def resolve_label_token_ids() -> Optional[List[int]]:
    global _label_token_ids, _label_token_source
    if _label_token_ids is not None or _label_token_source == "unavailable":
        return _label_token_ids

    local = [_first_token_id_local(lbl) for lbl in LABELS]
    if all(i is not None for i in local):
        _label_token_ids = [int(i) for i in local]  # type: ignore[arg-type]
        _label_token_source = "transformers"
        return _label_token_ids

    remote = []
    for lbl in LABELS:
        remote.append(await _first_token_id_server(lbl))
    if all(i is not None for i in remote):
        _label_token_ids = [int(i) for i in remote]  # type: ignore[arg-type]
        _label_token_source = "server /tokenize"
        return _label_token_ids

    _label_token_source = "unavailable"
    return None


# ---------------------------------------------------------------------------
# Transport 1: SGLang /v1/score
# ---------------------------------------------------------------------------
async def _via_score_endpoint(prompt: str, token_ids: List[int]) -> Optional[Dict[str, Any]]:
    """Returns {probabilities, latency_ms, raw} or None if the route is absent."""
    global _score_endpoint_state

    variants = [
        {"query": prompt, "items": [""]},
        {"query": "", "items": [prompt]},
    ]
    last_error: Optional[str] = None

    for variant in variants:
        payload: Dict[str, Any] = {
            "model": MODEL_NAME,
            "label_token_ids": token_ids,
            "apply_softmax": True,
            **variant,
        }
        elapsed = measure()
        try:
            body = await post_json(f"{SGLANG_BASE_URL}/v1/score", payload)
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            last_error = f"HTTP {status}"
            if status == 404:
                _score_endpoint_state = "unavailable"
                return None
            continue
        latency_ms = elapsed()

        scores = body.get("scores")
        if not isinstance(scores, list) or not scores:
            last_error = "response had no `scores`"
            continue
        row = scores[0] if isinstance(scores[0], list) else scores
        if len(row) != len(token_ids):
            last_error = f"expected {len(token_ids)} scores, got {len(row)}"
            continue

        _score_endpoint_state = "available"
        probs = normalise({LABEL_TO_CATEGORY[lbl]: float(v) for lbl, v in zip(LABELS, row)})
        return {
            "probabilities": probs,
            "latency_ms": latency_ms,
            "generated_tokens": 0,
            "transport": "SGLang /v1/score (label_token_ids, apply_softmax)",
            "raw": {"scores": row, "label_token_ids": token_ids},
        }

    _score_endpoint_state = "unavailable"
    if last_error:
        raise EngineUnavailable(f"/v1/score unusable: {last_error}")
    return None


# ---------------------------------------------------------------------------
# Transport 2: next-token logprobs from /v1/completions
# ---------------------------------------------------------------------------
def _collect_top_logprobs(choice: Dict[str, Any]) -> Dict[str, float]:
    lp = choice.get("logprobs") or {}
    top = lp.get("top_logprobs")
    if isinstance(top, list) and top and isinstance(top[0], dict):
        return {str(k): float(v) for k, v in top[0].items()}
    # OpenAI chat-style shape
    content = lp.get("content")
    if isinstance(content, list) and content:
        entries = content[0].get("top_logprobs") or []
        return {str(e.get("token")): float(e.get("logprob")) for e in entries if e.get("token") is not None}
    return {}


async def _via_logprobs(prompt: str) -> Dict[str, Any]:
    payload = {
        "model": MODEL_NAME,
        "prompt": prompt,
        "max_tokens": 1,
        "temperature": 0,
        "logprobs": 20,
    }
    elapsed = measure()
    try:
        body = await post_json(f"{GEN_BASE_URL}/v1/completions", payload)
    except httpx.HTTPStatusError as exc:
        raise EngineUnavailable(f"/v1/completions failed: {exc}") from exc
    latency_ms = elapsed()

    choices = body.get("choices") or []
    if not choices:
        raise EngineUnavailable("/v1/completions returned no choices")

    top = _collect_top_logprobs(choices[0])
    if not top:
        raise EngineUnavailable("server returned no top-k logprobs; cannot score choices")

    by_label: Dict[str, Optional[float]] = {}
    for lbl in LABELS:
        best: Optional[float] = None
        for token, logprob in top.items():
            if token.strip() == lbl:
                best = logprob if best is None else max(best, logprob)
        by_label[LABEL_TO_CATEGORY[lbl]] = best

    missing = [cat for cat, v in by_label.items() if v is None]
    probs = restricted_softmax(by_label)
    note = "Restricted softmax computed locally over the top-20 next-token logprobs."
    if missing:
        note += f" Labels outside the top-20 were assigned probability 0: {', '.join(missing)}."

    return {
        "probabilities": probs,
        "latency_ms": latency_ms,
        "generated_tokens": 1,
        "transport": "/v1/completions top-k logprobs (fallback)",
        "raw": {"top_logprobs": top},
        "note": note,
    }


# ---------------------------------------------------------------------------
async def run(text: str) -> EngineResult:
    user_content = scoring_prompt(text)
    prompt = render_prompt(user_content)

    token_ids = await resolve_label_token_ids()
    outcome: Optional[Dict[str, Any]] = None
    notes: List[str] = []

    if token_ids:
        try:
            outcome = await _via_score_endpoint(prompt, token_ids)
        except EngineUnavailable as exc:
            notes.append(str(exc))
            outcome = None
        if outcome is None:
            notes.append("SGLang /v1/score not usable; fell back to next-token logprobs.")
    else:
        notes.append(
            "Single-token label ids could not be resolved "
            "(install `transformers` to use SGLang /v1/score); using next-token logprobs."
        )

    if outcome is None:
        outcome = await _via_logprobs(prompt)

    probs = outcome["probabilities"]
    decision = max(probs, key=probs.get) if probs else None
    confidence = probs.get(decision) if decision else None

    if outcome.get("note"):
        notes.append(outcome["note"])
    notes.append(
        "Probabilities are relative to the five declared choices only. They are not "
        "calibrated real-world probabilities."
    )

    return EngineResult(
        decision=decision,
        latency_ms=outcome["latency_ms"],
        engine_label=f"{ENGINE_LABEL} - {outcome['transport']}",
        generated_tokens=outcome["generated_tokens"],
        prompt_tokens=None,
        probabilities=probs,
        confidence=confidence,
        confidence_source="restricted softmax over next-token logits",
        parse_ok=True,  # there is nothing to parse - the answer is an argmax
        raw_output=None,
        note=" ".join(notes),
        extra={"transport": outcome["transport"], "detail": outcome.get("raw")},
    )
