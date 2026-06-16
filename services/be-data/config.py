"""Environment-driven configuration for the BE Data service.

The service is owned by BE Lead (Data). BE Agent (Node.js) consumes it via
``BE_DATA_SERVICE_URL`` and applies an 800ms client timeout, so the compute
request path stays fast (pure NumPy/SciPy on caller-supplied inputs).
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


def _env(name: str, default: str = "") -> str:
    value = os.environ.get(name)
    return value if value is not None and value != "" else default


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw == "":
        return default
    try:
        return float(raw)
    except ValueError:
        return default


@dataclass(frozen=True)
class Settings:
    # HTTP server
    host: str = field(default_factory=lambda: _env("BE_DATA_HOST", "0.0.0.0"))
    port: int = field(default_factory=lambda: _env_int("BE_DATA_PORT", 8000))

    # Auth — when set, all POST endpoints require `Authorization: Bearer <token>`.
    # Leave empty to disable (local dev). /health is always open.
    auth_token: str = field(default_factory=lambda: _env("BE_DATA_AUTH_TOKEN", ""))

    # Merchant Moe subgraph (optional Python-side position fetch)
    merchant_moe_subgraph_url: str = field(
        default_factory=lambda: _env("MERCHANT_MOE_SUBGRAPH_URL", "")
    )

    # TEE signing
    # "auto" detects a Phala dstack socket, then AWS Nitro /dev/nsm, otherwise
    # falls back to developer-key. Force with "phala" | "nitro" | "developer-key".
    tee_provider: str = field(default_factory=lambda: _env("TEE_PROVIDER", "auto"))
    developer_signing_key: str = field(
        default_factory=lambda: _env(
            "DEVELOPER_SIGNING_KEY",
            "lp-guardian-be-data-dev-key-do-not-use-in-prod",
        )
    )

    # Portfolio math tuning
    dust_threshold_liquidity: float = field(
        default_factory=lambda: _env_float("BE_DATA_DUST_THRESHOLD_LIQUIDITY", 1e15)
    )
    monte_carlo_paths: int = field(
        default_factory=lambda: _env_int("BE_DATA_MONTE_CARLO_PATHS", 1000)
    )

    # Hardening for the public CVM endpoints (0 disables a check).
    max_body_bytes: int = field(
        default_factory=lambda: _env_int("BE_DATA_MAX_BODY_BYTES", 1_000_000)
    )
    rate_limit_per_min: int = field(
        default_factory=lambda: _env_int("BE_DATA_RATE_LIMIT_PER_MIN", 120)
    )


settings = Settings()
