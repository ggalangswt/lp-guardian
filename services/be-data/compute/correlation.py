"""Correlation matrix engine.

Builds a per-token price-return correlation matrix from Bybit daily closes and
derives a ``riskConcentration`` score (the strongest off-diagonal correlation).

The request path never blocks on the network: prices come from the warm Bybit
cache. When a token's price series is unavailable (unknown address or cold
cache) the matrix degrades to an identity-like structure with an EMULATED label.
"""

from __future__ import annotations

import numpy as np

from data import bybit

from .common import (
    LABEL_COMPUTED,
    LABEL_EMULATED,
    Position,
    parse_positions,
    provenance,
    unique_token_addresses,
)

_SOURCE = "BE Data /compute/correlation"


def _daily_returns(closes: list[float]) -> np.ndarray:
    arr = np.asarray(closes, dtype=float)
    if arr.size < 2:
        return np.array([])
    # log returns are numerically stable and additive
    with np.errstate(divide="ignore", invalid="ignore"):
        rets = np.diff(np.log(arr))
    return rets[np.isfinite(rets)]


def compute_correlation(
    raw_positions: list[dict] | None,
    price_history: list[dict] | None = None,
    days: int = 7,
) -> dict:
    positions: list[Position] = parse_positions(raw_positions)
    tokens = unique_token_addresses(positions)
    warnings: list[str] = []

    if len(tokens) < 2:
        return {
            "matrix": {t: {t: 1.0} for t in tokens},
            "tokens": tokens,
            "riskConcentration": 0.0,
            "provenance": provenance(
                LABEL_EMULATED,
                _SOURCE,
                ["Fewer than two distinct tokens; correlation is undefined."],
            ),
        }

    # Collect return series per token from the warm cache.
    returns_by_token: dict[str, np.ndarray] = {}
    missing: list[str] = []
    for addr in tokens:
        symbol = bybit.symbol_for_address(addr)
        if symbol is None:
            missing.append(addr)
            continue
        closes = bybit.get_cached_closes(symbol, days=days)
        if not closes:
            missing.append(addr)
            continue
        rets = _daily_returns(closes)
        if rets.size == 0:
            missing.append(addr)
            continue
        returns_by_token[addr] = rets

    if missing:
        warnings.append(
            f"Price history unavailable for {len(missing)} token(s); "
            "they default to zero off-diagonal correlation."
        )

    # Align all return series to the shortest common length.
    usable = {a: r for a, r in returns_by_token.items() if r.size >= 2}
    if len(usable) < 2:
        return {
            "matrix": {a: {b: (1.0 if a == b else 0.0) for b in tokens} for a in tokens},
            "tokens": tokens,
            "riskConcentration": 0.0,
            "provenance": provenance(
                LABEL_EMULATED,
                _SOURCE,
                warnings + ["Insufficient warm price series to compute correlation."],
            ),
        }

    min_len = min(r.size for r in usable.values())
    aligned_tokens = list(usable.keys())
    stacked = np.vstack([usable[a][-min_len:] for a in aligned_tokens])

    corr = np.corrcoef(stacked)
    corr = np.nan_to_num(corr, nan=0.0)
    np.fill_diagonal(corr, 1.0)

    # Build the full matrix over ALL tokens (missing ones get identity rows).
    matrix: dict[str, dict[str, float]] = {}
    for a in tokens:
        matrix[a] = {}
        for b in tokens:
            if a == b:
                matrix[a][b] = 1.0
            elif a in usable and b in usable:
                i = aligned_tokens.index(a)
                j = aligned_tokens.index(b)
                matrix[a][b] = round(float(corr[i, j]), 6)
            else:
                matrix[a][b] = 0.0

    # Risk concentration = strongest absolute off-diagonal correlation.
    off_diag = [
        abs(matrix[a][b]) for a in tokens for b in tokens if a != b
    ]
    risk_concentration = round(max(off_diag), 6) if off_diag else 0.0

    label = LABEL_EMULATED if missing else LABEL_COMPUTED
    return {
        "matrix": matrix,
        "tokens": tokens,
        "riskConcentration": risk_concentration,
        "provenance": provenance(label, _SOURCE, warnings),
    }
