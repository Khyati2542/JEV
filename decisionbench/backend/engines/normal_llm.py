"""Mode 1 - normal LLM generation.

The model is asked to *write* a JSON object containing the answer. Every token
of that JSON is generated autoregressively, then parsed by us. Nothing
constrains the output, so parsing can fail.
"""
from __future__ import annotations

from typing import Any, Dict, Optional

import httpx

from ..config import GEN_BASE_URL, MAX_NEW_TOKENS, MODEL_NAME, TEMPERATURE
from .base import (
    EngineResult,
    EngineUnavailable,
    chat_messages,
    generation_prompt,
    measure,
    parse_category,
    post_json,
)

ENGINE_LABEL = "Qwen chat completion, unconstrained JSON"


def build_payload(text: str) -> Dict[str, Any]:
    return {
        "model": MODEL_NAME,
        "messages": chat_messages(generation_prompt(text)),
        "temperature": TEMPERATURE,
        "max_tokens": MAX_NEW_TOKENS,
    }


def read_usage(body: Dict[str, Any]) -> tuple[Optional[int], Optional[int]]:
    """Token counts if the local server reports them, otherwise None -> 'N/A'.

    We never estimate or invent token counts.
    """
    usage = body.get("usage") or {}
    completion = usage.get("completion_tokens")
    prompt = usage.get("prompt_tokens")
    return (
        completion if isinstance(completion, int) else None,
        prompt if isinstance(prompt, int) else None,
    )


async def run(text: str) -> EngineResult:
    payload = build_payload(text)
    elapsed = measure()
    try:
        body = await post_json(f"{GEN_BASE_URL}/v1/chat/completions", payload)
    except httpx.HTTPStatusError as exc:
        raise EngineUnavailable(str(exc)) from exc
    latency_ms = elapsed()

    choices = body.get("choices") or []
    raw = ""
    if choices:
        raw = (choices[0].get("message") or {}).get("content") or ""

    decision, parse_ok, err = parse_category(raw)
    completion_tokens, prompt_tokens = read_usage(body)

    return EngineResult(
        decision=decision,
        latency_ms=latency_ms,
        engine_label=ENGINE_LABEL,
        generated_tokens=completion_tokens,
        prompt_tokens=prompt_tokens,
        probabilities=None,
        confidence=None,
        confidence_source="none",
        parse_ok=parse_ok,
        raw_output=raw,
        error=err,
        note=(
            "Free generation produces no per-choice score, so no confidence value "
            "exists and the human-review policy cannot be evaluated."
        ),
    )
