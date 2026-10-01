"""Pydantic request/response models. All four engines share one response shape."""
from __future__ import annotations

from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from .config import AUTO_DECIDE_MIN_MARGIN, AUTO_DECIDE_MIN_TOP

Method = Literal["normal", "structured", "jev", "classifier"]
Mode = Literal["live", "demo"]


class DecisionRequest(BaseModel):
    """Either `text` or `ticket_id` must be supplied.

    When `ticket_id` is supplied the dataset text is used and the ground-truth
    label is attached to the response *after* inference.
    """

    text: Optional[str] = None
    ticket_id: Optional[str] = None
    min_top: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    min_margin: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class DecisionResponse(BaseModel):
    method: Method
    engine_label: str
    mode: Mode
    simulated: bool = False

    ticket_id: Optional[str] = None
    decision: Optional[str] = None

    latency_ms: float
    generated_tokens: Optional[int] = None  # null renders as "N/A" in the UI
    prompt_tokens: Optional[int] = None

    probabilities: Optional[Dict[str, float]] = None
    confidence: Optional[float] = None
    confidence_source: str = "none"

    needs_human_review: Optional[bool] = None
    review_reason: Optional[str] = None
    thresholds: Dict[str, float] = Field(
        default_factory=lambda: {
            "min_top": AUTO_DECIDE_MIN_TOP,
            "min_margin": AUTO_DECIDE_MIN_MARGIN,
        }
    )

    parse_ok: bool = True
    raw_output: Optional[str] = None
    note: Optional[str] = None
    error: Optional[str] = None

    # Ground truth is only populated when the request referenced a dataset
    # ticket, and is only ever returned *after* the decision was produced.
    ground_truth: Optional[str] = None
    difficulty: Optional[str] = None
    ground_truth_reason: Optional[str] = None
    correct: Optional[bool] = None

    timestamp: str


class TicketOut(BaseModel):
    """Ticket as exposed to the UI: deliberately excludes `category`/`reason`
    so ground truth cannot be displayed before a run."""

    id: str
    text: str
    difficulty: str


class DatasetStats(BaseModel):
    total: int
    by_difficulty: Dict[str, int]
    by_category: Dict[str, int]
    categories: List[str]


class HealthResponse(BaseModel):
    status: str
    mode: Mode
    model: str
    gen_base_url: str
    score_base_url: str
    server_reachable: bool
    server_models: List[str] = Field(default_factory=list)
    score_endpoint: str  # "unknown" | "available" | "unavailable"
    tokenizer: str  # "transformers" | "server" | "unavailable"
    classifier_backend: str
    categories: List[str]
    label_map: Dict[str, str]
    thresholds: Dict[str, float]
    dataset: DatasetStats
    detail: Optional[str] = None


class BenchmarkRequest(BaseModel):
    methods: List[Method] = Field(default_factory=lambda: ["normal", "structured", "jev", "classifier"])
    limit: Optional[int] = Field(default=None, ge=1)
    difficulty: Optional[Literal["easy", "medium", "hard"]] = None
    min_top: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    min_margin: Optional[float] = Field(default=None, ge=0.0, le=1.0)


class MethodSummary(BaseModel):
    method: Method
    engine_label: str
    mode: Mode
    total: int
    decided: int
    parse_failures: int
    correct: int
    accuracy: Optional[float]
    accuracy_by_difficulty: Dict[str, Optional[float]]
    avg_latency_ms: Optional[float]
    p50_latency_ms: Optional[float]
    p95_latency_ms: Optional[float]
    avg_generated_tokens: Optional[float]
    total_generated_tokens: Optional[int]
    avg_confidence: Optional[float]
    human_review_rate: Optional[float]
    human_review_count: Optional[int]
    low_confidence_cases: Optional[int]
    confidence_available: bool


class BenchmarkResponse(BaseModel):
    run_id: str
    started_at: str
    finished_at: str
    mode: Mode
    model: str
    thresholds: Dict[str, float]
    dataset: DatasetStats
    summaries: List[MethodSummary]
    records: List[Dict[str, Any]]
    log_path: Optional[str] = None
