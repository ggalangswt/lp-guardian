"""Bybit price-history pipeline with a non-blocking, cache-first request path.

BE Agent calls the compute endpoints with an 800ms client timeout. A synchronous
Bybit round-trip can easily blow that budget, so the request path **only ever
reads the in-memory cache**. A background task pre-warms the common symbols on
startup and refreshes them on an interval. Cache misses fall back to a flat
series (no correlation signal) and schedule a fetch for the next request.

Positions arriving from BE Agent carry token *addresses* (token0/token1), not
symbols. ``symbol_for_address`` maps known Mantle token addresses to Bybit spot
symbols. Unknown tokens are skipped with a warning.
"""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass

import httpx

from config import settings

logger = logging.getLogger("be-data.bybit")

# --- Mantle token address -> Bybit spot symbol -------------------------------
# Addresses are lowercased Mantle mainnet tokens. USDC/USDT map to the sentinel
# "STABLE" symbol which is treated as a flat ~$1 series (zero correlation signal
# against volatile assets), so we never waste a Bybit call on stablecoins.
STABLE_SENTINEL = "STABLE"

_ADDRESS_TO_SYMBOL: dict[str, str] = {
    # Wrapped Mantle (gas token)
    "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8": "MNTUSDT",
    # Wrapped Ether
    "0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111": "ETHUSDT",
    # mETH (Mantle LSD) — tracks ETH closely
    "0xcda86a272531e8640cd7f1a92c01839911b90bb0": "ETHUSDT",
    # Wrapped Bitcoin (FBTC / WBTC class)
    "0xc96de26018a54d51c097160568752c4e3bd6c364": "BTCUSDT",
    # Stablecoins
    "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9": STABLE_SENTINEL,  # USDC
    "0x201eba5cc46d216ce6dc03f6a759e8e766e956ae": STABLE_SENTINEL,  # USDT
    # USDY (Ondo) — treat as stable-ish for correlation purposes
    "0x5be26527e817998a7206475496fde1e68957c5a6": STABLE_SENTINEL,
}

# Symbols the background loop keeps warm regardless of current positions.
_PREWARM_SYMBOLS = ["MNTUSDT", "ETHUSDT", "BTCUSDT"]

_DAY_SECONDS = 86_400


@dataclass
class _CacheEntry:
    closes: list[float]
    fetched_at: float


# symbol -> cache entry
_cache: dict[str, _CacheEntry] = {}
# symbols a request asked for but were not warm yet; the background loop picks
# these up so the *next* request is served from cache.
_pending: set[str] = set()
_lock = asyncio.Lock()


def symbol_for_address(address: str) -> str | None:
    """Map a token address to a Bybit symbol, or None if unknown."""
    if not address:
        return None
    return _ADDRESS_TO_SYMBOL.get(address.lower())


def _flat_series(days: int) -> list[float]:
    return [1.0] * days


def get_cached_closes(symbol: str, days: int = 7) -> list[float] | None:
    """Read-only, instant cache lookup used by the request path.

    Returns the close series if warm, otherwise schedules a background fetch and
    returns None so the caller can decide how to degrade.
    """
    if symbol == STABLE_SENTINEL:
        return _flat_series(days)

    entry = _cache.get(symbol)
    if entry is not None:
        return entry.closes[-days:] if len(entry.closes) >= days else entry.closes

    _pending.add(symbol)
    return None


async def _fetch_klines(client: httpx.AsyncClient, symbol: str, days: int) -> list[float] | None:
    """Fetch daily close prices from Bybit. Background path only."""
    params = {
        "category": "spot",
        "symbol": symbol,
        "interval": "D",
        "limit": str(max(days, 7)),
    }
    headers = {}
    if settings.bybit_api_key:
        headers["X-BAPI-API-KEY"] = settings.bybit_api_key

    url = f"{settings.bybit_api_base}/v5/market/kline"
    resp = await client.get(url, params=params, headers=headers, timeout=10.0)
    resp.raise_for_status()
    body = resp.json()

    if body.get("retCode") != 0:
        raise RuntimeError(f"Bybit retCode={body.get('retCode')} msg={body.get('retMsg')}")

    rows = body.get("result", {}).get("list", [])
    # Bybit returns newest-first: [startTime, open, high, low, close, volume, turnover]
    closes = [float(row[4]) for row in reversed(rows)]
    return closes or None


async def _fetch_with_backoff(symbol: str, days: int) -> list[float] | None:
    """Fetch with up to 3 retries and exponential backoff (background only)."""
    delays = [1.0, 2.0, 4.0]
    async with httpx.AsyncClient() as client:
        for attempt in range(len(delays) + 1):
            try:
                return await _fetch_klines(client, symbol, days)
            except Exception as exc:  # noqa: BLE001 - background best-effort
                if attempt >= len(delays):
                    logger.warning("Bybit fetch failed for %s: %s", symbol, exc)
                    return None
                await asyncio.sleep(delays[attempt])
    return None


async def refresh_symbol(symbol: str, days: int = 7) -> None:
    if symbol == STABLE_SENTINEL:
        return
    closes = await _fetch_with_backoff(symbol, days)
    if closes:
        async with _lock:
            _cache[symbol] = _CacheEntry(closes=closes, fetched_at=time.time())
        logger.info("Warmed Bybit cache for %s (%d closes)", symbol, len(closes))


async def prewarm() -> None:
    """Pre-warm the common symbols at startup. Best-effort, never raises."""
    await asyncio.gather(*(refresh_symbol(s) for s in _PREWARM_SYMBOLS), return_exceptions=True)


def _is_stale(entry: _CacheEntry) -> bool:
    return (time.time() - entry.fetched_at) > settings.price_cache_ttl_seconds


async def refresh_loop() -> None:
    """Background loop: refresh stale entries and drain pending symbols."""
    while True:
        try:
            await asyncio.sleep(settings.price_refresh_interval_seconds)
            # Symbols requested but not yet warm.
            pending = list(_pending)
            _pending.clear()
            # Plus any cached-but-stale symbols.
            stale = [s for s, e in list(_cache.items()) if _is_stale(e)]
            targets = set(pending) | set(stale)
            if targets:
                await asyncio.gather(
                    *(refresh_symbol(s) for s in targets), return_exceptions=True
                )
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001 - keep the loop alive
            logger.warning("Bybit refresh loop error: %s", exc)


def cache_status() -> dict:
    return {
        "warm_symbols": sorted(_cache.keys()),
        "pending_symbols": sorted(_pending),
    }
