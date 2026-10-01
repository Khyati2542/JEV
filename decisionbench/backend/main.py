"""DecisionBench API.

Run from the project root:
    uvicorn backend.main:app --reload --port 8000
"""
from __future__ import annotations

import random
from contextlib import asynccontextmanager
from typing import List, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from . import dataset
from .benchmark import run_benchmark
from .config import (
    AUTO_DECIDE_MIN_MARGIN,
    AUTO_DECIDE_MIN_TOP,
    CATEGORIES,
    CORS_ORIGINS,
    FORCE_DEMO,
    FRONTEND_DIST,
    GEN_BASE_URL,
    LABEL_TO_CATEGORY,
    MODEL_NAME,
    SGLANG_BASE_URL,
)
from .engines import classifier, jev_scorer
from .engines.base import close_client, get_tokenizer, invalidate_health_cache, probe_server
from .runner import current_mode, decide
from .schemas import (
    BenchmarkRequest,
    BenchmarkResponse,
    DecisionRequest,
    DecisionResponse,
    HealthResponse,
    TicketOut,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    dataset.load()  # fail fast on a malformed dataset
    # Fit the classifier up front. Left lazy, the first request would be timed
    # with model fitting included and report a latency an order of magnitude
    # above every later call.
    classifier.backend()
    yield
    await close_client()


app = FastAPI(
    title="DecisionBench",
    description="Generate vs Decide - benchmarking approaches to bounded AI decisions.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS or ["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Health / metadata
# ---------------------------------------------------------------------------
@app.get("/api/health", response_model=HealthResponse)
async def health(refresh: bool = Query(False)) -> HealthResponse:
    if refresh:
        invalidate_health_cache()
    status = await probe_server(force=refresh)
    mode = await current_mode()
    _, tokenizer_state = get_tokenizer()

    detail = status.get("detail")
    if FORCE_DEMO:
        detail = "FORCE_DEMO=1 - demo mode is forced by configuration."

    return HealthResponse(
        status="ok",
        mode=mode,  # type: ignore[arg-type]
        model=MODEL_NAME,
        gen_base_url=GEN_BASE_URL,
        score_base_url=SGLANG_BASE_URL,
        server_reachable=bool(status["reachable"]),
        server_models=status.get("models") or [],
        score_endpoint=jev_scorer.score_endpoint_state(),
        tokenizer=tokenizer_state if tokenizer_state != "unloaded" else "unavailable",
        classifier_backend=classifier.backend_name(),
        categories=CATEGORIES,
        label_map=LABEL_TO_CATEGORY,
        thresholds={"min_top": AUTO_DECIDE_MIN_TOP, "min_margin": AUTO_DECIDE_MIN_MARGIN},
        dataset=dataset.stats(),  # type: ignore[arg-type]
        detail=detail,
    )


@app.get("/api/tickets", response_model=List[TicketOut])
async def tickets(difficulty: Optional[str] = Query(None)) -> List[TicketOut]:
    """Ground truth is deliberately omitted so the UI cannot reveal it early."""
    rows = dataset.filtered(difficulty=difficulty)
    return [TicketOut(id=r["id"], text=r["text"], difficulty=r["difficulty"]) for r in rows]


@app.get("/api/tickets/random", response_model=TicketOut)
async def random_ticket(difficulty: str = Query("hard")) -> TicketOut:
    row = dataset.random_by_difficulty(difficulty, random.Random())
    if row is None:
        raise HTTPException(404, f"no tickets with difficulty {difficulty!r}")
    return TicketOut(id=row["id"], text=row["text"], difficulty=row["difficulty"])


# ---------------------------------------------------------------------------
# Decisions
# ---------------------------------------------------------------------------
async def _decide(method: str, req: DecisionRequest) -> DecisionResponse:
    try:
        return await decide(
            method,
            text=req.text,
            ticket_id=req.ticket_id,
            min_top=req.min_top,
            min_margin=req.min_margin,
        )
    except KeyError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@app.post("/api/decision/normal", response_model=DecisionResponse)
async def decision_normal(req: DecisionRequest) -> DecisionResponse:
    return await _decide("normal", req)


@app.post("/api/decision/structured", response_model=DecisionResponse)
async def decision_structured(req: DecisionRequest) -> DecisionResponse:
    return await _decide("structured", req)


@app.post("/api/decision/jev", response_model=DecisionResponse)
async def decision_jev(req: DecisionRequest) -> DecisionResponse:
    return await _decide("jev", req)


@app.post("/api/decision/classifier", response_model=DecisionResponse)
async def decision_classifier(req: DecisionRequest) -> DecisionResponse:
    return await _decide("classifier", req)


# ---------------------------------------------------------------------------
# Benchmark
# ---------------------------------------------------------------------------
@app.post("/api/benchmark", response_model=BenchmarkResponse)
async def benchmark(req: BenchmarkRequest) -> BenchmarkResponse:
    return await run_benchmark(req)


# ---------------------------------------------------------------------------
# Optional: serve the built frontend so `npm run build` gives a single origin.
# ---------------------------------------------------------------------------
if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")

    @app.get("/")
    async def index() -> FileResponse:
        return FileResponse(str(FRONTEND_DIST / "index.html"))
