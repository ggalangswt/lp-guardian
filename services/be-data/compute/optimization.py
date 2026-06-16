"""Portfolio optimization engine (risk-parity).

There are no USD valuations on the wire positions, so ``liquidity`` is used as
the position-size proxy. Weights are keyed by ``tokenId`` (unique per position);
each position carries a synthesized ``pool`` label (``token0/token1``).

The correlation argument may be either:
  * a full CorrelationResponse  -> ``{matrix, tokens, riskConcentration, ...}``
  * BE Agent's fallback object  -> ``{method, correlatedExposureBps, concentrationBps}``
Both shapes are handled; an absent/degraded matrix falls back to an identity
covariance (correlation = 0 between distinct tokens).
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import minimize

from .common import (
    LABEL_COMPUTED,
    LABEL_EMULATED,
    Position,
    parse_positions,
    provenance,
)

_SOURCE = "BE Data /compute/optimize"


def _position_correlation(positions: list[Position], correlation: dict | None) -> np.ndarray:
    """Build an NxN correlation matrix over positions from a token-keyed matrix."""
    n = len(positions)
    rho = np.eye(n)
    token_matrix = None
    if isinstance(correlation, dict):
        maybe = correlation.get("matrix")
        if isinstance(maybe, dict):
            token_matrix = maybe

    if token_matrix is None:
        return rho

    for i in range(n):
        for j in range(n):
            if i == j:
                continue
            # Approximate position-vs-position correlation by the correlation of
            # their token0 legs (the dominant exposure for a concentrated LP).
            a = positions[i].token0
            b = positions[j].token0
            try:
                rho[i, j] = float(token_matrix.get(a, {}).get(b, 0.0))
            except (TypeError, ValueError):
                rho[i, j] = 0.0
    np.fill_diagonal(rho, 1.0)
    return rho


def _risk_parity_weights(cov: np.ndarray) -> np.ndarray | None:
    """Solve for weights with equal risk contribution. Returns None on failure."""
    n = cov.shape[0]
    if n == 0:
        return None
    if n == 1:
        return np.array([1.0])

    target = 1.0 / n

    def objective(w: np.ndarray) -> float:
        port_var = float(w @ cov @ w)
        if port_var <= 0:
            return 1e9
        # marginal risk contribution
        mrc = cov @ w
        rc = w * mrc / np.sqrt(port_var)
        rc_norm = rc / rc.sum()
        return float(np.sum((rc_norm - target) ** 2))

    w0 = np.full(n, 1.0 / n)
    constraints = ({"type": "eq", "fun": lambda w: np.sum(w) - 1.0},)
    bounds = [(1e-6, 1.0)] * n

    try:
        result = minimize(
            objective,
            w0,
            method="SLSQP",
            bounds=bounds,
            constraints=constraints,
            options={"maxiter": 200, "ftol": 1e-9},
        )
    except Exception:  # noqa: BLE001
        return None

    if not result.success:
        return None
    w = np.clip(result.x, 0.0, None)
    total = w.sum()
    if total <= 0:
        return None
    return w / total


def compute_optimize(
    raw_positions: list[dict] | None,
    correlation: dict | None,
    constraints: dict | None = None,
) -> dict:
    positions: list[Position] = parse_positions(raw_positions)
    warnings: list[str] = []

    if not positions:
        return {
            "optimalWeights": {},
            "actions": [],
            "expectedReturn": 0.0,
            "expectedRisk": 0.0,
            "provenance": provenance(
                LABEL_EMULATED, _SOURCE, ["No positions supplied to optimize."]
            ),
        }

    n = len(positions)

    # Current weights from the liquidity size proxy.
    sizes = np.array([max(p.liquidity, 0.0) for p in positions], dtype=float)
    if sizes.sum() <= 0:
        sizes = np.ones(n)
        warnings.append("All positions have zero liquidity; assuming equal current weights.")
    current_weights = sizes / sizes.sum()

    # Volatility proxy: without per-token vol we assume unit variance and let the
    # correlation structure drive risk parity. Covariance = correlation here.
    rho = _position_correlation(positions, correlation)
    cov = rho  # unit variances -> covariance equals correlation

    optimal = _risk_parity_weights(cov)
    degraded = optimal is None
    if degraded:
        optimal = current_weights.copy()
        warnings.append("Risk-parity optimization failed; falling back to current weights.")

    # Portfolio risk metrics under the chosen weights.
    expected_risk = float(np.sqrt(max(optimal @ cov @ optimal, 0.0)))
    # Expected return proxy: diversification benefit vs. current allocation.
    current_risk = float(np.sqrt(max(current_weights @ cov @ current_weights, 0.0)))
    expected_return = round(current_risk - expected_risk, 6)  # risk reduction as "alpha"

    optimal_weights: dict[str, float] = {}
    actions: list[dict] = []
    for idx, pos in enumerate(positions):
        target = round(float(optimal[idx]), 6)
        current = round(float(current_weights[idx]), 6)
        optimal_weights[pos.token_id] = target

        delta = target - current
        if abs(delta) < 0.02:  # within 2% — leave as is
            continue
        if target < 1e-4:
            action_type = "CLOSE"
        elif delta < 0:
            action_type = "REDUCE"
        else:
            action_type = "INCREASE"
        actions.append(
            {
                "type": action_type,
                "tokenId": pos.token_id,
                "pool": pos.pool_label,
                "currentWeight": current,
                "targetWeight": target,
            }
        )

    label = LABEL_EMULATED if degraded else LABEL_COMPUTED
    return {
        "optimalWeights": optimal_weights,
        "actions": actions,
        "expectedReturn": expected_return,
        "expectedRisk": round(expected_risk, 6),
        "provenance": provenance(label, _SOURCE, warnings),
    }
