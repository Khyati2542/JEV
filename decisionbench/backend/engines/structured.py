"""Mode 2 - structured / constrained output generation.

Same prompt as `normal_llm` (byte-identical, so the decoding constraint is the
only variable), but the sampler is restricted to a JSON schema whose `category`
field is an enum over the decision space.

The model still *generates tokens*. The constraint guarantees the shape of the
answer; it does not remove the generation step, and it still produces no
per-choice probability.

Constraint negotiation order:
  1. OpenAI-style `response_format: {"type": "json_schema", ...}`
  2. SGLang/vLLM style `regex` (or `guided_regex`) in the request body
  3. unconstrained, clearly reported in `note` as NOT constrained
"""
from __future__ import annotations

from typing import Any, Dict, List, Tuple

import httpx

from ..config import CATEGORIES, GEN_BASE_URL, MAX_NEW_TOKENS, MODEL_NAME, TEMPERATURE
from .base import (
    EngineResult,
    EngineUnavailable,
    chat_messages,
    generation_prompt,
    measure,
    parse_category,
    post_json,
)
from .normal_llm import read_usage

ENGINE_LABEL = "Qwen chat completion, schema-constrained JSON"

CATEGORY_ENUM = list(CATEGORIES)
JSON_SCHEMA: Dict[str, Any] = {
    "type": "object",
    "properties": {"category": {"type": "string", "enum": CATEGORY_ENUM}},
    "required": ["category"],
    "additionalProperties": False,
}
CATEGORY_REGEX = r'\{"category": "(' + "|".join(CATEGORIES) + r')"\}'


def _base_payload(text: str) -> Dict[str, Any]:
    return {
        "model": MODEL_NAME,
        "messages": chat_messages(generation_prompt(text)),
        "temperature": TEMPERATURE,
        "max_tokens": MAX_NEW_TOKENS,
    }


def constraint_attempts(text: str) -> List[Tuple[str, Dict[str, Any]]]:
    schema_payload = _base_payload(text)
    schema_payload["response_format"] = {
        "type": "json_schema",
        "json_schema": {"name": "support_category", "schema": JSON_SCHEMA, "strict": True},
    }

    regex_payload = _base_payload(text)
    regex_payload["regex"] = CATEGORY_REGEX

    guided_payload = _base_payload(text)
    guided_payload["guided_regex"] = CATEGORY_REGEX

    return [
        ("json_schema", schema_payload),
        ("regex", regex_payload),
        ("guided_regex", guided_payload),
        ("none", _base_payload(text)),
    ]


async def run(text: str) -> EngineResult:
    attempts = constraint_attempts(text)
    rejected: List[str] = []

    for kind, payload in attempts:
        elapsed = measure()
        try:
            body = await post_json(f"{GEN_BASE_URL}/v1/chat/completions", payload)
        except httpx.HTTPStatusError as exc:
            status = exc.response.status_code if exc.response is not None else 0
            if status in (400, 404, 422, 500) and kind != "none":
                rejected.append(f"{kind} -> HTTP {status}")
                continue
            raise EngineUnavailable(str(exc)) from exc
        latency_ms = elapsed()

        choices = body.get("choices") or []
        raw = ""
        if choices:
            raw = (choices[0].get("message") or {}).get("content") or ""

        decision, parse_ok, err = parse_category(raw)
        completion_tokens, prompt_tokens = read_usage(body)

        if kind == "none":
            note = (
                "NOT CONSTRAINED - this server rejected every constraint mechanism "
                f"({'; '.join(rejected)}), so this run is identical to normal generation."
            )
        else:
            note = f"Output constrained with `{kind}` against the 5-category enum."
            if rejected:
                note += f" Earlier attempts rejected: {'; '.join(rejected)}."
            note += " Validity is guaranteed by the sampler, but no per-choice probability is produced."

        return EngineResult(
            decision=decision,
            latency_ms=latency_ms,
            engine_label=f"{ENGINE_LABEL} ({kind})",
            generated_tokens=completion_tokens,
            prompt_tokens=prompt_tokens,
            probabilities=None,
            confidence=None,
            confidence_source="none",
            parse_ok=parse_ok,
            raw_output=raw,
            error=err,
            note=note,
            extra={"constraint": kind, "rejected": rejected},
        )

    raise EngineUnavailable("no constraint strategy succeeded")
