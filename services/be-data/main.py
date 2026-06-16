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
from contextlib import asynccontextmanager
from typing import Any

from fastapi import Depends, FastAPI, Header, HTTPException
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


class SimulateRequest(BaseModel):
    positions: list[dict[str, Any]] = Field(default_factory=list)
    scenarios: list[str] = Field(default_factory=list)


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
    return compute_optimize(req.positions, req.correlation, req.constraints)


@app.post("/compute/simulate", dependencies=[Depends(require_auth)])
async def simulate(req: SimulateRequest) -> dict:
    return compute_simulate(req.positions, req.scenarios)


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
