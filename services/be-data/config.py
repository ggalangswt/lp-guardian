"""Environment-driven configuration for the BE Data service.

The service is owned by BE Lead (Data). BE Agent (Node.js) consumes it via
``BE_DATA_SERVICE_URL`` and applies an 800ms client timeout, so anything in the
request path must stay fast (see ``data/bybit.py`` for the cache strategy).
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

    # Bybit data pipeline
    bybit_api_base: str = field(
        default_factory=lambda: _env("BYBIT_API_BASE", "https://api.bybit.com")
    )
    bybit_api_key: str = field(default_factory=lambda: _env("BYBIT_API_KEY", ""))
    # How long a cached kline series stays fresh before the background loop refetches.
    price_cache_ttl_seconds: int = field(
        default_factory=lambda: _env_int("BE_DATA_PRICE_CACHE_TTL", 3600)
    )
    # How often the background refresh loop wakes up.
    price_refresh_interval_seconds: int = field(
        default_factory=lambda: _env_int("BE_DATA_PRICE_REFRESH_INTERVAL", 300)
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


settings = Settings()
