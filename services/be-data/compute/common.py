"""Shared helpers for the compute engines: position parsing and provenance.

Positions arrive as ``NfpmPositionSnapshot`` objects serialized by BE Agent's
``normalizeForWire`` (bigints become strings). Shape:

    {
      "tokenId": "123", "owner": "0x..", "token0": "0x..", "token1": "0x..",
      "fee": 3000, "tickLower": -887220, "tickUpper": 887220,
      "liquidity": "1000000", "tokensOwed0": "0", "tokensOwed1": "0"
    }

There is no poolAddress or USD value — ``liquidity`` is the only size signal.
"""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

# Provenance labels mirror BE Agent's BeDataLabel union.
LABEL_VERIFIED = "VERIFIED"
LABEL_COMPUTED = "COMPUTED"
LABEL_ESTIMATED = "ESTIMATED"
LABEL_EMULATED = "EMULATED"
LABEL_UNAVAILABLE = "UNAVAILABLE"


def provenance(label: str, source: str, warnings: list[str] | None = None) -> dict:
    warns = warnings or []
    return {
        "label": label,
        "source": source,
        "degraded": label in (LABEL_EMULATED, LABEL_UNAVAILABLE) or bool(warns),
        "warnings": warns,
        "observedAt": int(time.time() * 1000),
    }


@dataclass
class Position:
    token_id: str
    token0: str
    token1: str
    fee: int
    tick_lower: int
    tick_upper: int
    liquidity: float
    raw: dict[str, Any] = field(default_factory=dict)

    @property
    def pool_label(self) -> str:
        return f"{self.token0}/{self.token1}"


def _to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def _to_int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_positions(raw_positions: list[dict] | None) -> list[Position]:
    """Normalize wire positions into typed Position objects, skipping junk."""
    out: list[Position] = []
    for idx, item in enumerate(raw_positions or []):
        if not isinstance(item, dict):
            continue
        token_id = str(item.get("tokenId", item.get("token_id", idx)))
        token0 = str(item.get("token0", "")).lower()
        token1 = str(item.get("token1", "")).lower()
        if not token0 or not token1:
            continue
        out.append(
            Position(
                token_id=token_id,
                token0=token0,
                token1=token1,
                fee=_to_int(item.get("fee")),
                tick_lower=_to_int(item.get("tickLower", item.get("tick_lower"))),
                tick_upper=_to_int(item.get("tickUpper", item.get("tick_upper"))),
                liquidity=_to_float(item.get("liquidity")),
                raw=item,
            )
        )
    return out


def unique_token_addresses(positions: list[Position]) -> list[str]:
    seen: list[str] = []
    for pos in positions:
        for addr in (pos.token0, pos.token1):
            if addr and addr not in seen:
                seen.append(addr)
    return seen
