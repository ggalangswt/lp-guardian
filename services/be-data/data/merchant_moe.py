"""Merchant Moe position fetch — the Mantle-first Scout source (must-have).

Thin wrapper over the shared multi-protocol :mod:`data.subgraphs` indexer for the
``merchant-moe`` protocol.

NOTE: Merchant Moe is a Liquidity Book (bin-based) DEX, NOT a Uniswap-V3-style
AMM, so it has no ``NonfungiblePositionManager`` to enumerate. The on-chain NFPM
fallback (:mod:`data.mantle_rpc`) therefore does NOT apply here — it reads a
V3-style NFPM (Agni), which is a different protocol. Mislabeling Agni positions
as Merchant Moe would be dishonest, so this path stays subgraph-only and degrades
to UNAVAILABLE when unconfigured/unreachable.

BE Agent (Node) is the primary position scanner; this BE Data path is an
independent alternative/cross-check that runs from the service.
"""

from __future__ import annotations

from . import subgraphs


def fetch_positions(wallet: str, first: int = 100) -> dict:
    return subgraphs.fetch_positions("merchant-moe", wallet, first)
