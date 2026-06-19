"""Multi-protocol subgraph position indexing.

A single, defensively-mapped concentrated-liquidity ``positions`` query reused
across the Mantle DEX subgraphs the brief lists:

  * ``merchant-moe`` — Mantle-first Scout source (**must-have**)
  * ``agni``         — Agni Finance (nice-to-have)
  * ``fluxion``      — Fluxion (nice-to-have)

Each protocol just supplies an endpoint URL (via env). The query and result
mapping are shared because all three expose Uniswap-V3-style position entities;
``_map_position`` reads fields defensively so minor schema differences still map.

BE Agent (Node) is the primary position scanner; this BE Data path is an
independent alternative/cross-check. Degrades gracefully to ``UNAVAILABLE``
provenance (empty list, never fabricated) when a URL is unset or a query fails.
"""

from __future__ import annotations

import logging

import httpx

from compute.common import (
    LABEL_UNAVAILABLE,
    LABEL_VERIFIED,
    provenance,
)
from config import settings

logger = logging.getLogger("be-data.subgraphs")

# protocol -> (human label, Settings attribute holding the endpoint URL).
PROTOCOLS: dict[str, tuple[str, str]] = {
    "merchant-moe": ("Merchant Moe subgraph", "merchant_moe_subgraph_url"),
    "agni": ("Agni Finance subgraph", "agni_subgraph_url"),
    "fluxion": ("Fluxion subgraph", "fluxion_subgraph_url"),
}

# A V3-style positions query. Exact schemas differ per protocol; fields are read
# defensively in `_map_position` so partial schemas still work.
_QUERY = """
query Positions($owner: String!, $first: Int!) {
  positions(where: { owner: $owner }, first: $first) {
    id
    owner
    liquidity
    tickLower { tickIdx }
    tickUpper { tickIdx }
    pool { id feeTier token0 { id } token1 { id } }
    token0 { id }
    token1 { id }
  }
}
"""


def _first(*values):
    for v in values:
        if v not in (None, ""):
            return v
    return None


def _map_position(raw: dict, idx: int) -> dict | None:
    if not isinstance(raw, dict):
        return None
    pool = raw.get("pool") if isinstance(raw.get("pool"), dict) else {}

    token0 = _first(
        (raw.get("token0") or {}).get("id") if isinstance(raw.get("token0"), dict) else None,
        (pool.get("token0") or {}).get("id") if isinstance(pool.get("token0"), dict) else None,
    )
    token1 = _first(
        (raw.get("token1") or {}).get("id") if isinstance(raw.get("token1"), dict) else None,
        (pool.get("token1") or {}).get("id") if isinstance(pool.get("token1"), dict) else None,
    )
    if not token0 or not token1:
        return None

    def _tick(node):
        if isinstance(node, dict):
            return node.get("tickIdx")
        return node

    return {
        "tokenId": str(_first(raw.get("id"), idx)),
        "owner": str(raw.get("owner", "")).lower(),
        "token0": str(token0).lower(),
        "token1": str(token1).lower(),
        "fee": int(_first(pool.get("feeTier"), 0) or 0),
        "tickLower": int(_first(_tick(raw.get("tickLower")), 0) or 0),
        "tickUpper": int(_first(_tick(raw.get("tickUpper")), 0) or 0),
        "liquidity": str(_first(raw.get("liquidity"), "0")),
    }


def supported_protocols() -> list[str]:
    return list(PROTOCOLS.keys())


def endpoint_for(protocol: str) -> str | None:
    entry = PROTOCOLS.get(protocol)
    if not entry:
        return None
    return getattr(settings, entry[1], "") or None


def fetch_positions(protocol: str, wallet: str, first: int = 100) -> dict:
    """Query one protocol's subgraph for a wallet's concentrated-liquidity positions."""
    entry = PROTOCOLS.get(protocol)
    if not entry:
        return {
            "protocol": protocol,
            "positions": [],
            "provenance": provenance(
                LABEL_UNAVAILABLE,
                f"{protocol} subgraph",
                [f"Unknown protocol '{protocol}'. Supported: {', '.join(PROTOCOLS)}."],
            ),
        }

    source, attr = entry
    url = getattr(settings, attr, "") or None
    if not url:
        return {
            "protocol": protocol,
            "positions": [],
            "provenance": provenance(
                LABEL_UNAVAILABLE, source, [f"{attr.upper()} is not configured."]
            ),
        }

    try:
        resp = httpx.post(
            url,
            json={"query": _QUERY, "variables": {"owner": wallet.lower(), "first": first}},
            timeout=10.0,
        )
        resp.raise_for_status()
        body = resp.json()
        if body.get("errors"):
            raise RuntimeError(str(body["errors"])[:200])
        rows = (body.get("data") or {}).get("positions") or []
        positions = [p for i, r in enumerate(rows) if (p := _map_position(r, i))]
        return {
            "protocol": protocol,
            "positions": positions,
            "provenance": provenance(LABEL_VERIFIED, source),
        }
    except Exception as exc:  # noqa: BLE001 - degrade gracefully
        logger.warning("%s fetch failed for %s: %s", source, wallet, exc)
        return {
            "protocol": protocol,
            "positions": [],
            "provenance": provenance(
                LABEL_UNAVAILABLE, source, [f"Subgraph query failed: {exc}"]
            ),
        }
