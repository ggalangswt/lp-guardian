"""BE Data FastAPI service — portfolio math + TEE signing for LP Guardian.

Owned by BE Lead (Data). Consumed by BE Agent (Node.js) via BE_DATA_SERVICE_URL
with an 800ms client timeout, so the request path stays cache-first and fast.

Endpoints (schemas mirror apps/server/src/services/beDataClient.ts):
  GET  /health
  POST /compute/correlation
  POST /compute/optimize
  POST /compute/simulate
  POST /tee/sign
  POST /tee/verify
  GET  /positions/merchant-moe/{wallet}
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from compute.correlation import compute_correlation
from compute.optimization import compute_optimize
from compute.simulation import compute_simulate
from config import settings
from data import merchant_moe
from tee import sign as tee_sign
from tee.verify import verify_attestation

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("be-data")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("BE Data started (tee_provider=%s)", tee_sign.resolve_provider())
    yield


app = FastAPI(title="LP Guardian BE Data", version="1.0.0", lifespan=lifespan)

# Fixed-window per-IP rate-limit state: ip -> (window_minute, count).
_rate_state: dict[str, tuple[int, int]] = {}


@app.middleware("http")
async def harden(request: Request, call_next):
    """Payload-size cap (413) + per-IP rate limit (429) on POST endpoints."""
    if request.method == "POST":
        cap = settings.max_body_bytes
        if cap > 0:
            length = request.headers.get("content-length")
            if length and length.isdigit() and int(length) > cap:
                return JSONResponse(status_code=413, content={"detail": "payload too large"})

        rpm = settings.rate_limit_per_min
        if rpm > 0:
            ip = request.client.host if request.client else "unknown"
            window = int(time.time() // 60)
            w, count = _rate_state.get(ip, (window, 0))
            if w != window:
                w, count = window, 0
            count += 1
            _rate_state[ip] = (w, count)
            if count > rpm:
                return JSONResponse(status_code=429, content={"detail": "rate limit exceeded"})

    return await call_next(request)


def require_auth(authorization: str | None = Header(default=None)) -> None:
    """Enforce Bearer auth on protected endpoints when BE_DATA_AUTH_TOKEN is set."""
    token = settings.auth_token
    if not token:
        return  # auth disabled
    if authorization != f"Bearer {token}":
        raise HTTPException(status_code=401, detail="unauthorized")


# --- Request models ----------------------------------------------------------

class CorrelationRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(default_factory=list)
    priceHistory: list[dict[str, Any]] = Field(default_factory=list)


class OptimizeRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(default_factory=list)
    correlation: Any = None
    constraints: dict[str, Any] = Field(default_factory=dict)
    priceHistory: list[dict[str, Any]] = Field(default_factory=list)


class SimulateRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(default_factory=list)
    scenarios: list[str] = Field(default_factory=list)
    priceHistory: list[dict[str, Any]] = Field(default_factory=list)


class TeeSignRequest(BaseModel):
    inputData: Any = None
    outputData: Any = None
    reportHash: str = "0x"


class TeeVerifyRequest(BaseModel):
    attestation: str
    inputData: Any = None
    outputData: Any = None
    reportHash: str = "0x"
    provider: str | None = None


# --- Endpoints ---------------------------------------------------------------

@app.get("/health")
async def health() -> dict:
    return {
        "ok": True,
        "tee_provider": tee_sign.resolve_provider(),
        "tee_active": tee_sign.tee_active(),
    }


@app.post("/compute/correlation", dependencies=[Depends(require_auth)])
async def correlation(req: CorrelationRequest) -> dict:
    return compute_correlation(req.positions, req.priceHistory)


@app.post("/compute/optimize", dependencies=[Depends(require_auth)])
async def optimize(req: OptimizeRequest) -> dict:
    return compute_optimize(req.positions, req.correlation, req.constraints, req.priceHistory)


@app.post("/compute/simulate", dependencies=[Depends(require_auth)])
async def simulate(req: SimulateRequest) -> dict:
    return compute_simulate(req.positions, req.scenarios, price_history=req.priceHistory)


@app.post("/tee/sign", dependencies=[Depends(require_auth)])
async def sign(req: TeeSignRequest) -> dict:
    return tee_sign.sign_report(req.inputData, req.outputData, req.reportHash)


@app.post("/tee/verify", dependencies=[Depends(require_auth)])
async def verify(req: TeeVerifyRequest) -> dict:
    return verify_attestation(
        req.attestation, req.inputData, req.outputData, req.reportHash, req.provider
    )


@app.get("/positions/merchant-moe/{wallet}", dependencies=[Depends(require_auth)])
async def merchant_moe_positions(wallet: str) -> dict:
    return merchant_moe.fetch_positions(wallet)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=settings.host, port=settings.port)
