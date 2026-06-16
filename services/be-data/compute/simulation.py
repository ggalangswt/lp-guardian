"""Simulation engine — Monte Carlo what-if scenarios over a 7-day horizon.

Each scenario projects ``projectedPnL``, ``projectedFees`` and ``projectedIL``
for the portfolio. Without USD valuations we work in liquidity-proxy units and
report figures normalized to the total portfolio size, so the numbers are
directionally meaningful for ranking scenarios even on synthetic inputs.

Scenarios:
  * HOLD             — keep positions; IL accrues with volatility, fees accrue flat.
  * REBALANCE        — assume correlation reduced; lower IL, modest fee drag from churn.
  * CONSOLIDATE_DUST — drop sub-threshold positions; fees concentrate, IL on remainder.

``baseline`` is treated as an alias for the full scenario set.
"""

from __future__ import annotations

import numpy as np

from config import settings

from .common import (
    LABEL_COMPUTED,
    LABEL_EMULATED,
    Position,
    parse_positions,
    provenance,
)

_SOURCE = "BE Data /compute/simulate"
_HORIZON_DAYS = 7
_DEFAULT_SCENARIOS = ["HOLD", "REBALANCE", "CONSOLIDATE_DUST"]

# Daily volatility assumption for the underlying tokens (no per-token vol on the
# wire). 4%/day is a reasonable mid-cap crypto proxy.
_DAILY_VOL = 0.04
# Daily fee yield proxy on active liquidity.
_DAILY_FEE_YIELD = 0.0008  # ~0.08%/day


def _expand_scenarios(scenarios: list[str] | None) -> list[str]:
    if not scenarios:
        return list(_DEFAULT_SCENARIOS)
    expanded: list[str] = []
    for s in scenarios:
        key = str(s).strip().lower()
        if key in ("baseline", "all", ""):
            return list(_DEFAULT_SCENARIOS)
        if key in ("hold",):
            expanded.append("HOLD")
        elif key in ("rebalance",):
            expanded.append("REBALANCE")
        elif key in ("consolidate", "consolidate_dust", "dust"):
            expanded.append("CONSOLIDATE_DUST")
        else:
            expanded.append(s.upper())
    # de-dupe, preserve order
    seen: list[str] = []
    for s in expanded:
        if s not in seen:
            seen.append(s)
    return seen or list(_DEFAULT_SCENARIOS)


def _impermanent_loss(price_ratio: np.ndarray) -> np.ndarray:
    """Classic constant-product IL for a price ratio relative to entry (=1.0)."""
    r = np.maximum(price_ratio, 1e-9)
    return (2.0 * np.sqrt(r) / (1.0 + r)) - 1.0  # <= 0


def _simulate_scenario(
    name: str, active_sizes: np.ndarray, vol_scale: float, fee_scale: float, rng: np.random.Generator
) -> dict:
    total_size = float(active_sizes.sum())
    if total_size <= 0:
        return {
            "scenario": name,
            "projectedPnL": 0.0,
            "projectedFees": 0.0,
            "projectedIL": 0.0,
        }

    paths = settings.monte_carlo_paths
    daily_vol = _DAILY_VOL * vol_scale
    weights = active_sizes / total_size

    # Geometric Brownian motion for each position's price ratio over the horizon.
    # shape: (paths, positions)
    shocks = rng.normal(
        loc=-0.5 * daily_vol**2,
        scale=daily_vol,
        size=(paths, _HORIZON_DAYS, active_sizes.size),
    )
    cum = np.exp(shocks.sum(axis=1))  # (paths, positions) price ratio at horizon

    il_frac = _impermanent_loss(cum)  # (paths, positions), <= 0
    # Portfolio IL weighted by position size, averaged across paths.
    port_il = float(np.mean(il_frac @ weights))

    # Fees accrue deterministically on active liquidity over the horizon.
    fee_frac = _DAILY_FEE_YIELD * fee_scale * _HORIZON_DAYS
    port_fees = fee_frac

    projected_pnl = port_fees + port_il  # fees positive, IL negative

    return {
        "scenario": name,
        # normalized fractions of portfolio value (×100 for percent at the UI)
        "projectedPnL": round(projected_pnl, 6),
        "projectedFees": round(port_fees, 6),
        "projectedIL": round(port_il, 6),
    }


def compute_simulate(
    raw_positions: list[dict] | None,
    scenarios: list[str] | None = None,
    seed: int | None = 42,
) -> dict:
    positions: list[Position] = parse_positions(raw_positions)
    names = _expand_scenarios(scenarios)
    warnings: list[str] = []

    if not positions:
        results = [
            {"scenario": n, "projectedPnL": 0.0, "projectedFees": 0.0, "projectedIL": 0.0}
            for n in names
        ]
        return {
            "results": results,
            "provenance": provenance(
                LABEL_EMULATED, _SOURCE, ["No positions supplied to simulate."]
            ),
        }

    rng = np.random.default_rng(seed)
    sizes = np.array([max(p.liquidity, 0.0) for p in positions], dtype=float)
    if sizes.sum() <= 0:
        sizes = np.ones(len(positions))
        warnings.append("All positions have zero liquidity; assuming equal sizes.")

    dust_mask = sizes >= settings.dust_threshold_liquidity
    consolidated_sizes = sizes[dust_mask] if dust_mask.any() else sizes

    results: list[dict] = []
    for name in names:
        if name == "HOLD":
            results.append(_simulate_scenario(name, sizes, 1.0, 1.0, rng))
        elif name == "REBALANCE":
            # Rebalancing reduces correlated exposure -> lower effective vol,
            # but churn costs a little fee yield.
            results.append(_simulate_scenario(name, sizes, 0.7, 0.9, rng))
        elif name == "CONSOLIDATE_DUST":
            # Dropping dust concentrates liquidity into fee-earning ranges.
            results.append(_simulate_scenario(name, consolidated_sizes, 1.0, 1.15, rng))
        else:
            results.append(_simulate_scenario(name, sizes, 1.0, 1.0, rng))

    return {
        "results": results,
        "provenance": provenance(LABEL_COMPUTED, _SOURCE, warnings),
    }
