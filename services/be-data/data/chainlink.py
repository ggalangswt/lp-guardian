"""Chainlink price-feed reader (the MUST-HAVE on-chain oracle fallback).

Reads a Chainlink ``AggregatorV3`` feed on Mantle via read-only ``eth_call``:
``latestRoundData()`` for the answer + ``decimals()`` to scale it. This is the
oracle fallback for when off-chain price APIs (CoinGecko / Bybit) are down — the
price comes straight from an on-chain contract, so it is independently
verifiable.

Feeds are configured per symbol via ``CHAINLINK_FEEDS`` (a JSON map of
``"ETH/USD": "0x..."``) and the Mantle RPC via ``MANTLE_RPC_URL``. Degrades
gracefully to ``UNAVAILABLE`` provenance — never fabricates a price — when the
RPC/feed is unconfigured or the call fails.
"""

from __future__ import annotations

import logging
import time

from compute.common import (
    LABEL_UNAVAILABLE,
    LABEL_VERIFIED,
    provenance,
)
from config import settings

from . import rpc

logger = logging.getLogger("be-data.chainlink")

_SOURCE = "Chainlink AggregatorV3 (Mantle)"

# Stale-price guard: a Chainlink answer older than this is reported but flagged.
_STALE_AFTER_SECONDS = 24 * 3600


def _read_decimals(rpc_url: str, feed: str) -> int:
    words = rpc.call_words(rpc_url, feed, rpc.calldata("decimals()"))
    if not words:
        raise rpc.RpcError("decimals() returned nothing")
    return rpc.decode_uint(words[0])


def _read_latest(rpc_url: str, feed: str) -> dict:
    # latestRoundData() -> (roundId, answer, startedAt, updatedAt, answeredInRound)
    words = rpc.call_words(rpc_url, feed, rpc.calldata("latestRoundData()"))
    if len(words) < 5:
        raise rpc.RpcError("latestRoundData() returned an unexpected shape")
    return {
        "roundId": rpc.decode_uint(words[0]),
        "answer": rpc.decode_int(words[1]),
        "updatedAt": rpc.decode_uint(words[3]),
    }


def fetch_price(symbol: str) -> dict:
    """Read a single Chainlink feed for ``symbol`` (e.g. ``"ETH/USD"``)."""
    sym = symbol.upper().strip()
    feed = settings.chainlink_feeds.get(sym)
    rpc_url = settings.mantle_rpc_url

    if not feed:
        return {
            "symbol": sym,
            "price": None,
            "provenance": provenance(
                LABEL_UNAVAILABLE,
                _SOURCE,
                [f"No Chainlink feed address configured for {sym} (set CHAINLINK_FEEDS)."],
            ),
        }
    if not rpc_url:
        return {
            "symbol": sym,
            "price": None,
            "provenance": provenance(
                LABEL_UNAVAILABLE, _SOURCE, ["MANTLE_RPC_URL is not configured."]
            ),
        }

    try:
        decimals = _read_decimals(rpc_url, feed)
        latest = _read_latest(rpc_url, feed)
    except rpc.RpcError as exc:
        logger.warning("Chainlink read failed for %s (%s): %s", sym, feed, exc)
        return {
            "symbol": sym,
            "price": None,
            "provenance": provenance(LABEL_UNAVAILABLE, _SOURCE, [f"Feed read failed: {exc}"]),
        }

    price = latest["answer"] / (10**decimals) if decimals >= 0 else float(latest["answer"])
    warnings: list[str] = []
    age = int(time.time()) - latest["updatedAt"] if latest["updatedAt"] else None
    if latest["answer"] <= 0:
        warnings.append("Feed returned a non-positive answer.")
    if age is not None and age > _STALE_AFTER_SECONDS:
        warnings.append(f"Feed answer is stale ({age // 3600}h old).")

    label = LABEL_UNAVAILABLE if (latest["answer"] <= 0) else LABEL_VERIFIED
    return {
        "symbol": sym,
        "feed": feed,
        "price": price if latest["answer"] > 0 else None,
        "decimals": decimals,
        "roundId": str(latest["roundId"]),
        "updatedAt": latest["updatedAt"],
        "provenance": provenance(label, _SOURCE, warnings),
    }


def fetch_prices(symbols: list[str]) -> dict:
    """Read several Chainlink feeds; returns one entry per requested symbol."""
    results = [fetch_price(s) for s in symbols]
    any_ok = any(r.get("price") is not None for r in results)
    label = LABEL_VERIFIED if any_ok else LABEL_UNAVAILABLE
    return {
        "prices": results,
        "provenance": provenance(
            label,
            _SOURCE,
            [] if any_ok else ["No configured Chainlink feed could be read."],
        ),
    }
