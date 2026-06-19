"""Bybit market-data adapter — daily close price history (MUST-HAVE source).

Fetches daily ``kline`` (candlestick) closes from Bybit's public v5 REST API and
maps them onto token addresses so the result drops straight into the compute
endpoints as ``priceHistory`` (``[{token, closes:[…]}]``) — the same shape
``compute/returns.py`` consumes.

Token→symbol resolution comes from ``BYBIT_SYMBOL_MAP`` (a JSON map of
``"0xtoken": "ETHUSDT"``). No API key is needed for public market data, but the
service degrades gracefully to ``UNAVAILABLE`` when Bybit is unreachable (e.g.
datacenter IPs are blocked at Bybit's edge — the documented reason the Node
backend is the primary price fetcher).
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

logger = logging.getLogger("be-data.bybit")

_SOURCE = "Bybit v5 market/kline"


def _fetch_closes(symbol: str, days: int) -> list[float]:
    """Fetch up to ``days`` daily closes for a Bybit spot symbol (oldest-first)."""
    url = settings.bybit_api_base.rstrip("/") + "/v5/market/kline"
    params = {
        "category": "spot",
        "symbol": symbol,
        "interval": "D",
        "limit": str(max(2, min(days, 1000))),
    }
    resp = httpx.get(url, params=params, timeout=10.0)
    resp.raise_for_status()
    body = resp.json()
    if body.get("retCode") not in (0, "0", None):
        raise RuntimeError(f"Bybit retCode={body.get('retCode')} {body.get('retMsg')}")
    rows = ((body.get("result") or {}).get("list")) or []
    # Each row: [start, open, high, low, close, volume, turnover]; newest-first.
    closes: list[float] = []
    for row in reversed(rows):
        try:
            closes.append(float(row[4]))
        except (IndexError, TypeError, ValueError):
            continue
    return closes


def fetch_price_history(tokens: list[str], days: int = 30) -> dict:
    """Build ``priceHistory`` for the given token addresses via Bybit.

    Tokens without a configured symbol, or whose series can't be fetched, are
    omitted (so the matrix simply excludes them rather than fabricating data).
    """
    symbol_map = settings.bybit_symbol_map
    unique = []
    for t in tokens:
        addr = str(t).lower()
        if addr and addr not in unique:
            unique.append(addr)

    if not symbol_map:
        return {
            "priceHistory": [],
            "provenance": provenance(
                LABEL_UNAVAILABLE,
                _SOURCE,
                ["BYBIT_SYMBOL_MAP is not configured (no token→symbol mapping)."],
            ),
        }

    history: list[dict] = []
    warnings: list[str] = []
    transport_failed = False
    for addr in unique:
        symbol = symbol_map.get(addr)
        if not symbol:
            warnings.append(f"No Bybit symbol mapped for {addr}.")
            continue
        try:
            closes = _fetch_closes(symbol, days)
            if len(closes) >= 2:
                history.append({"token": addr, "symbol": symbol, "closes": closes})
            else:
                warnings.append(f"Insufficient history for {symbol}.")
        except Exception as exc:  # noqa: BLE001 - degrade gracefully
            transport_failed = True
            warnings.append(f"{symbol} fetch failed: {exc}")
            logger.warning("Bybit fetch failed for %s (%s): %s", addr, symbol, exc)

    if not history:
        reason = (
            "Bybit unreachable (datacenter IPs may be blocked at Bybit's edge)."
            if transport_failed
            else "No mapped token returned a usable series."
        )
        return {
            "priceHistory": [],
            "provenance": provenance(LABEL_UNAVAILABLE, _SOURCE, [reason, *warnings]),
        }

    return {
        "priceHistory": history,
        "provenance": provenance(LABEL_VERIFIED, _SOURCE, warnings),
    }
