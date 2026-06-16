"""Optional Python-side position fetch from the Merchant Moe subgraph.

BE Agent (Node) is the primary position scanner; this is an independent
alternative/cross-check source that runs from the BE Data service. It queries a
concentrated-liquidity ``positions`` entity for a wallet and maps results to the
same wire shape the compute endpoints expect (``token0``/``token1`` addresses,
``liquidity``, ``tickLower``/``tickUpper``).

Degrades gracefully: returns an empty list with UNAVAILABLE provenance when the
subgraph URL is unset or the query fails (the CVM may not have egress).
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

logger = logging.getLogger("be-data.merchant-moe")

# A V3-style positions query. The exact Merchant Moe schema may differ; fields
# are read defensively in `_map_position` so partial schemas still work.
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


def fetch_positions(wallet: str, first: int = 100) -> dict:
    source = "Merchant Moe subgraph"
    url = settings.merchant_moe_subgraph_url
    if not url:
        return {
            "positions": [],
            "provenance": provenance(
                LABEL_UNAVAILABLE, source, ["MERCHANT_MOE_SUBGRAPH_URL is not configured."]
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
            "positions": positions,
            "provenance": provenance(LABEL_VERIFIED, source),
        }
    except Exception as exc:  # noqa: BLE001 - degrade gracefully
        logger.warning("Merchant Moe fetch failed for %s: %s", wallet, exc)
        return {
            "positions": [],
            "provenance": provenance(
                LABEL_UNAVAILABLE, source, [f"Subgraph query failed: {exc}"]
            ),
        }
