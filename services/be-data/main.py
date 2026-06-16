"""BE Data FastAPI service — portfolio math + TEE signing for LP Guardian.

Owned by BE Lead (Data). Consumed by BE Agent (Node.js) via BE_DATA_SERVICE_URL
with an 800ms client timeout, so the request path stays cache-first and fast.

Endpoints (schemas mirror apps/server/src/services/beDataClient.ts):
  GET  /health
  POST /compute/correlation
  POST /compute/optimize
  POST /compute/simulate
  POST /tee/sign
"""

from __future__ import annotations

import asyncio
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

from compute.correlation import compute_correlation
from compute.optimization import compute_optimize
from compute.simulation import compute_simulate
from config import settings
from data import bybit
from tee import sign as tee_sign

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("be-data")

_background_tasks: set[asyncio.Task] = set()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm the Bybit cache in the background so the server accepts connections
    # immediately — never block startup on (possibly slow/failing) Bybit. The
    # compute endpoints degrade gracefully until the cache is warm.
    prewarm_task = asyncio.create_task(bybit.prewarm())
    loop_task = asyncio.create_task(bybit.refresh_loop())
    _background_tasks.update({prewarm_task, loop_task})
    logger.info("BE Data started (tee_provider=%s)", tee_sign.resolve_provider())
    try:
        yield
    finally:
        for task in _background_tasks:
            task.cancel()
        await asyncio.gather(*_background_tasks, return_exceptions=True)


app = FastAPI(title="LP Guardian BE Data", version="1.0.0", lifespan=lifespan)


# --- Request models ----------------------------------------------------------

class CorrelationRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(default_factory=list)
    priceHistory: list[dict[str, Any]] = Field(default_factory=list)


class OptimizeRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(default_factory=list)
    correlation: Any = None
    constraints: dict[str, Any] = Field(default_factory=dict)


class SimulateRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(default_factory=list)
    scenarios: list[str] = Field(default_factory=list)


class TeeSignRequest(BaseModel):
    inputData: Any = None
    outputData: Any = None
    reportHash: str = "0x"


# --- Endpoints ---------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "tee_provider": tee_sign.resolve_provider(),
        "tee_active": tee_sign.tee_active(),
        "cache": bybit.cache_status(),
    }


@app.post("/compute/correlation")
async def correlation(req: CorrelationRequest) -> dict:
    return compute_correlation(req.positions, req.priceHistory)


@app.post("/compute/optimize")
async def optimize(req: OptimizeRequest) -> dict:
    return compute_optimize(req.positions, req.correlation, req.constraints)


@app.post("/compute/simulate")
async def simulate(req: SimulateRequest) -> dict:
    return compute_simulate(req.positions, req.scenarios)


@app.post("/tee/sign")
async def sign(req: TeeSignRequest) -> dict:
    return tee_sign.sign_report(req.inputData, req.outputData, req.reportHash)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)
