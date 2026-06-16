"""Build per-position risk (covariance + volatility) from attested priceHistory.

Each LP position has exposure to BOTH legs, so we model a position's daily return
as the average of its two token legs' log-returns:

    r_position = 0.5 * (r_token0 + r_token1)

Stacking these per-position series gives a covariance matrix that captures real
per-token volatility (B1) AND both-leg cross-correlation (B2) in one object —
replacing the old token0-only, unit-variance approximation.

Returns ``usable=False`` whenever priceHistory is missing/partial so callers fall
back to their constant-based estimates instead of fabricating risk.
"""

from __future__ import annotations

import numpy as np

from .common import Position


def _log_returns(closes: list[float]) -> np.ndarray:
    arr = np.asarray(closes, dtype=float)
    if arr.size < 2:
        return np.array([])
    with np.errstate(divide="ignore", invalid="ignore"):
        rets = np.diff(np.log(arr))
    return rets[np.isfinite(rets)]


def _closes_by_token(price_history: list[dict] | None) -> dict[str, list[float]]:
    """token-address -> close series, accepting closes[] or prices[{price}|[ts,price]]."""
    out: dict[str, list[float]] = {}
    for entry in price_history or []:
        if not isinstance(entry, dict):
            continue
        token = str(entry.get("token", entry.get("address", ""))).lower()
        if not token:
            continue
        if isinstance(entry.get("closes"), list):
            raw = entry["closes"]
        elif isinstance(entry.get("prices"), list):
            raw = entry["prices"]
        else:
            raw = []
        closes: list[float] = []
        for point in raw:
            try:
                if isinstance(point, (int, float)):
                    closes.append(float(point))
                elif isinstance(point, dict) and "price" in point:
                    closes.append(float(point["price"]))
                elif isinstance(point, (list, tuple)) and len(point) >= 2:
                    closes.append(float(point[1]))
            except (TypeError, ValueError):
                continue
        if len(closes) >= 2:
            out[token] = closes
    return out


def build_position_risk(
    positions: list[Position], price_history: list[dict] | None
) -> dict:
    """Compute a real per-position covariance + daily vols from priceHistory.

    Returns ``{usable, cov, vols}`` where ``cov`` is an (N x N) covariance over
    all positions and ``vols`` is the per-position daily volatility. ``usable`` is
    True only when every position has return series for both legs.
    """
    n = len(positions)
    result = {"usable": False, "cov": None, "vols": None}
    if n == 0:
        return result

    closes = _closes_by_token(price_history)
    returns_by_token = {addr: _log_returns(c) for addr, c in closes.items()}
    returns_by_token = {a: r for a, r in returns_by_token.items() if r.size >= 2}

    # Every position needs both legs covered, else fall back.
    series: list[np.ndarray] = []
    for pos in positions:
        r0 = returns_by_token.get(pos.token0)
        r1 = returns_by_token.get(pos.token1)
        if r0 is None or r1 is None:
            return result
        m = min(r0.size, r1.size)
        series.append(0.5 * (r0[-m:] + r1[-m:]))

    min_len = min(s.size for s in series)
    if min_len < 2:
        return result

    matrix = np.vstack([s[-min_len:] for s in series])  # (N x T)
    cov = np.cov(matrix)
    cov = np.atleast_2d(cov)
    vols = np.sqrt(np.clip(np.diag(cov), 0.0, None))

    return {"usable": True, "cov": cov, "vols": vols}
