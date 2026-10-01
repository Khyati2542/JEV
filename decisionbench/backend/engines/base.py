"""Shared engine plumbing: prompts, HTTP client, softmax and the review policy.

BENCHMARK FAIRNESS NOTE
-----------------------
Every engine builds its prompt from the exact same `core_prompt()`: same ticket
text, same category list, same ordering. The engines differ only in the one
thing being compared:

  normal      core prompt + "reply with JSON"      -> free generation
  structured  core prompt + "reply with JSON"      -> constrained generation
  jev         core prompt + "return only the label"-> no generation at all

`normal` and `structured` are given byte-identical prompts so the only variable
between them is the decoding constraint.
"""
from __future__ import annotations

import json
import math
import re
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

from ..config import (
    AUTO_DECIDE_MIN_MARGIN,
    AUTO_DECIDE_MIN_TOP,
    CATEGORIES,
    CHAT_TEMPLATE,
    GEN_BASE_URL,
    HEALTH_CACHE_S,
    HEALTH_TIMEOUT_S,
    LABEL_TO_CATEGORY,
    MODEL_NAME,
    REQUEST_TIMEOUT_S,
)


class EngineUnavailable(RuntimeError):
    """Raised when the local model server cannot serve a request.

    The API layer catches this and falls back to clearly-labelled demo data.
    """


@dataclass
class EngineResult:
    decision: Optional[str]
    latency_ms: float
    engine_label: str
    mode: str = "live"
    simulated: bool = False
    generated_tokens: Optional[int] = None
    prompt_tokens: Optional[int] = None
    probabilities: Optional[Dict[str, float]] = None
    confidence: Optional[float] = None
    confidence_source: str = "none"
    parse_ok: bool = True
    raw_output: Optional[str] = None
    note: Optional[str] = None
    error: Optional[str] = None
    extra: Dict[str, Any] = field(default_factory=dict)


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------
SYSTEM_PROMPT = "You are a support ticket triage system."

_CHOICE_BLOCK = "\n".join(f"{lbl} = {cat}" for lbl, cat in LABEL_TO_CATEGORY.items())

JSON_INSTRUCTION = (
    'Reply with only a JSON object of the form {"category": "<category>"} where '
    "<category> is exactly one of: " + ", ".join(CATEGORIES) + ". Output nothing else."
)
LABEL_INSTRUCTION = "Return only the label."


def core_prompt(text: str) -> str:
    """The identical decision problem given to every engine."""
    return (
        "Classify the support request into exactly one category.\n\n"
        f"{_CHOICE_BLOCK}\n\n"
        "Support request:\n"
        "<<<\n"
        f"{text.strip()}\n"
        ">>>"
    )


def generation_prompt(text: str) -> str:
    return f"{core_prompt(text)}\n\n{JSON_INSTRUCTION}"


def scoring_prompt(text: str) -> str:
    return f"{core_prompt(text)}\n\n{LABEL_INSTRUCTION}"


def chat_messages(user_content: str) -> List[Dict[str, str]]:
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]


def qwen_chatml(user_content: str) -> str:
    """Hand-built Qwen ChatML, used when `transformers` is not installed.

    Ending the string on the assistant header means the next token the model
    produces is the first token of its answer - which is exactly the position
    we want to read logits from.
    """
    return (
        f"<|im_start|>system\n{SYSTEM_PROMPT}<|im_end|>\n"
        f"<|im_start|>user\n{user_content}<|im_end|>\n"
        "<|im_start|>assistant\n"
    )


# ---------------------------------------------------------------------------
# Tokenizer (optional). Used to resolve single-token label ids for /v1/score
# and to apply the model's own chat template.
# ---------------------------------------------------------------------------
_tokenizer: Any = None
_tokenizer_state = "unloaded"  # unloaded | transformers | unavailable


def get_tokenizer() -> Tuple[Any, str]:
    global _tokenizer, _tokenizer_state
    if _tokenizer_state != "unloaded":
        return _tokenizer, _tokenizer_state
    try:
        from transformers import AutoTokenizer  # type: ignore

        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        _tokenizer_state = "transformers"
    except Exception:
        _tokenizer = None
        _tokenizer_state = "unavailable"
    return _tokenizer, _tokenizer_state


def render_prompt(user_content: str) -> str:
    """Render a flat prompt string positioned at the start of the answer."""
    if CHAT_TEMPLATE == "raw":
        return user_content
    if CHAT_TEMPLATE in {"auto", "transformers"}:
        tok, state = get_tokenizer()
        if state == "transformers":
            try:
                return tok.apply_chat_template(
                    chat_messages(user_content), tokenize=False, add_generation_prompt=True
                )
            except Exception:
                pass
    return qwen_chatml(user_content)


# ---------------------------------------------------------------------------
# HTTP
# ---------------------------------------------------------------------------
_client: Optional[httpx.AsyncClient] = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(timeout=REQUEST_TIMEOUT_S)
    return _client


async def close_client() -> None:
    global _client
    if _client is not None and not _client.is_closed:
        await _client.aclose()
    _client = None


async def post_json(url: str, payload: Dict[str, Any], timeout: Optional[float] = None) -> Dict[str, Any]:
    try:
        resp = await client().post(url, json=payload, timeout=timeout or REQUEST_TIMEOUT_S)
    except httpx.HTTPError as exc:
        raise EngineUnavailable(f"cannot reach {url}: {exc}") from exc
    if resp.status_code >= 400:
        raise httpx.HTTPStatusError(
            f"{resp.status_code} from {url}: {resp.text[:400]}", request=resp.request, response=resp
        )
    return resp.json()


_health_cache: Dict[str, Any] = {"ts": 0.0, "value": None}


async def probe_server(force: bool = False) -> Dict[str, Any]:
    """Cheap reachability probe against the OpenAI-compatible /v1/models route."""
    now = time.time()
    if not force and _health_cache["value"] is not None and now - _health_cache["ts"] < HEALTH_CACHE_S:
        return _health_cache["value"]

    result: Dict[str, Any] = {"reachable": False, "models": [], "detail": None}
    try:
        resp = await client().get(f"{GEN_BASE_URL}/v1/models", timeout=HEALTH_TIMEOUT_S)
        if resp.status_code < 400:
            body = resp.json()
            result["reachable"] = True
            result["models"] = [m.get("id") for m in body.get("data", []) if m.get("id")]
        else:
            result["detail"] = f"HTTP {resp.status_code} from /v1/models"
    except Exception as exc:
        result["detail"] = f"{type(exc).__name__}: {exc}"

    _health_cache.update(ts=now, value=result)
    return result


def invalidate_health_cache() -> None:
    _health_cache.update(ts=0.0, value=None)


# ---------------------------------------------------------------------------
# Maths
# ---------------------------------------------------------------------------
def restricted_softmax(logits: Dict[str, Optional[float]]) -> Dict[str, float]:
    """Softmax computed *only* across the declared choices.

    Keys whose value is None are treated as -inf (the label never appeared in
    the returned top-k) and receive probability 0.
    """
    present = {k: v for k, v in logits.items() if v is not None and math.isfinite(v)}
    if not present:
        n = len(logits) or 1
        return {k: 1.0 / n for k in logits}
    hi = max(present.values())
    exp = {k: math.exp(v - hi) for k, v in present.items()}
    total = sum(exp.values()) or 1.0
    return {k: (exp.get(k, 0.0) / total) for k in logits}


def normalise(probs: Dict[str, float]) -> Dict[str, float]:
    total = sum(max(0.0, v) for v in probs.values())
    if total <= 0:
        n = len(probs) or 1
        return {k: 1.0 / n for k in probs}
    return {k: max(0.0, v) / total for k, v in probs.items()}


def top_two(probs: Dict[str, float]) -> Tuple[Tuple[str, float], Tuple[str, float]]:
    ordered = sorted(probs.items(), key=lambda kv: kv[1], reverse=True)
    first = ordered[0] if ordered else ("", 0.0)
    second = ordered[1] if len(ordered) > 1 else ("", 0.0)
    return first, second


# ---------------------------------------------------------------------------
# Human-review policy (application-level, NOT a property of the model)
# ---------------------------------------------------------------------------
def apply_policy(
    probabilities: Optional[Dict[str, float]],
    min_top: Optional[float] = None,
    min_margin: Optional[float] = None,
) -> Tuple[Optional[bool], Optional[str]]:
    min_top = AUTO_DECIDE_MIN_TOP if min_top is None else min_top
    min_margin = AUTO_DECIDE_MIN_MARGIN if min_margin is None else min_margin

    if not probabilities:
        return None, "No per-choice probability available from this method."

    (c1, p1), (c2, p2) = top_two(probabilities)
    margin = p1 - p2
    if p1 >= min_top and margin >= min_margin:
        return False, f"Auto-decide: top {c1}={p1:.2f} >= {min_top:.2f} and margin {margin:.2f} >= {min_margin:.2f}."
    reasons = []
    if p1 < min_top:
        reasons.append(f"top probability {p1:.2f} < {min_top:.2f}")
    if margin < min_margin:
        reasons.append(f"margin over {c2} is {margin:.2f} < {min_margin:.2f}")
    return True, "Human review: " + " and ".join(reasons) + "."


# ---------------------------------------------------------------------------
# Output parsing for the generative engines
# ---------------------------------------------------------------------------
_FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)
_CANON = {c.lower(): c for c in CATEGORIES}


def extract_json_object(raw: str) -> Optional[Dict[str, Any]]:
    if not raw:
        return None
    candidates: List[str] = [raw.strip()]
    fenced = _FENCE.search(raw)
    if fenced:
        candidates.insert(0, fenced.group(1).strip())
    # first balanced {...} block
    start = raw.find("{")
    if start != -1:
        depth = 0
        for i in range(start, len(raw)):
            if raw[i] == "{":
                depth += 1
            elif raw[i] == "}":
                depth -= 1
                if depth == 0:
                    candidates.append(raw[start : i + 1])
                    break
    for cand in candidates:
        try:
            obj = json.loads(cand)
        except Exception:
            continue
        if isinstance(obj, dict):
            return obj
    return None


def parse_category(raw: str) -> Tuple[Optional[str], bool, Optional[str]]:
    """Return (category, parse_ok, error).

    `parse_ok` is False when the model did not emit a valid JSON object with a
    recognised category. We deliberately do NOT fall back to fuzzy text search:
    parsing success is one of the metrics being measured.
    """
    obj = extract_json_object(raw)
    if obj is None:
        return None, False, "model output was not valid JSON"
    value = obj.get("category")
    if not isinstance(value, str):
        return None, False, "JSON object had no string 'category' field"
    canon = _CANON.get(value.strip().lower())
    if canon is None:
        return None, False, f"category {value!r} is not in the decision space"
    return canon, True, None


def measure():
    """Context-manager-free stopwatch helper. Returns a callable -> elapsed ms."""
    start = time.perf_counter()
    return lambda: (time.perf_counter() - start) * 1000.0
