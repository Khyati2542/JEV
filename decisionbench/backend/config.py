"""Central configuration for DecisionBench.

Everything here is overridable with environment variables (see .env.example).
No value in this file requires a paid service or an API key.
"""
from __future__ import annotations

import os
from pathlib import Path

try:  # python-dotenv is optional
    from dotenv import load_dotenv

    load_dotenv()
except Exception:  # pragma: no cover
    pass


def _flag(name: str, default: str = "0") -> bool:
    return os.getenv(name, default).strip().lower() in {"1", "true", "yes", "on"}


ROOT = Path(__file__).resolve().parent.parent
DATA_PATH = Path(os.getenv("DATA_PATH", str(ROOT / "data" / "tickets.json")))
RUNS_DIR = Path(os.getenv("RUNS_DIR", str(ROOT / "runs")))
FRONTEND_DIST = Path(os.getenv("FRONTEND_DIST", str(ROOT / "frontend" / "dist")))

# ---------------------------------------------------------------------------
# The decision space. This is the whole point of the project: the set of
# possible answers is known *before* inference runs.
# ---------------------------------------------------------------------------
CATEGORIES: list[str] = ["Billing", "Technical", "Account", "Security", "Other"]
LABELS: list[str] = ["A", "B", "C", "D", "E"]
LABEL_TO_CATEGORY: dict[str, str] = dict(zip(LABELS, CATEGORIES))
CATEGORY_TO_LABEL: dict[str, str] = {c: lbl for lbl, c in LABEL_TO_CATEGORY.items()}

# ---------------------------------------------------------------------------
# Local open-weight model + local inference server
# ---------------------------------------------------------------------------
MODEL_NAME = os.getenv("MODEL_NAME", "Qwen/Qwen2.5-3B-Instruct")
# SGLang (or any OpenAI-compatible local server) base URL.
SGLANG_BASE_URL = os.getenv("SGLANG_BASE_URL", "http://127.0.0.1:30000").rstrip("/")
# Generation endpoints may live on a different server than /v1/score.
GEN_BASE_URL = os.getenv("GEN_BASE_URL", SGLANG_BASE_URL).rstrip("/")

REQUEST_TIMEOUT_S = float(os.getenv("REQUEST_TIMEOUT_S", "120"))
HEALTH_TIMEOUT_S = float(os.getenv("HEALTH_TIMEOUT_S", "2.5"))
HEALTH_CACHE_S = float(os.getenv("HEALTH_CACHE_S", "15"))

MAX_NEW_TOKENS = int(os.getenv("MAX_NEW_TOKENS", "64"))
TEMPERATURE = float(os.getenv("TEMPERATURE", "0"))

# auto -> use the model's own chat template via transformers when available,
# otherwise fall back to hand-built Qwen ChatML. "qwen" forces ChatML, "raw"
# sends the bare prompt with no chat wrapper.
CHAT_TEMPLATE = os.getenv("CHAT_TEMPLATE", "auto").strip().lower()

# Force the UI into demo mode even if a model server happens to be running.
FORCE_DEMO = _flag("FORCE_DEMO", "0")

# ---------------------------------------------------------------------------
# Human-review policy.
#
# These are APPLICATION-LEVEL policy thresholds. They are not a requirement of
# fixed-choice scoring and not part of any model. They are editable in the UI.
# ---------------------------------------------------------------------------
AUTO_DECIDE_MIN_TOP = float(os.getenv("AUTO_DECIDE_MIN_TOP", "0.80"))
AUTO_DECIDE_MIN_MARGIN = float(os.getenv("AUTO_DECIDE_MIN_MARGIN", "0.20"))

CORS_ORIGINS = [o.strip() for o in os.getenv("CORS_ORIGINS", "*").split(",") if o.strip()]

API_HOST = os.getenv("API_HOST", "127.0.0.1")
API_PORT = int(os.getenv("API_PORT", "8000"))
