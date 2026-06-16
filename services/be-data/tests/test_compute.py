"""Unit tests for the BE Data compute engines and TEE signing.

These run offline: correlation falls back to EMULATED when the Bybit cache is
cold (no network in the test process), which is exactly the degraded path we
want to assert is safe.
"""

from __future__ import annotations

import json

from compute.correlation import compute_correlation
from compute.optimization import compute_optimize
from compute.simulation import compute_simulate
from data import bybit
from tee import sign as tee_sign

WMNT = "0x78c1b0c915c4faa5fffa6cabf0219da63d7f4cb8"
WETH = "0xdeaddeaddeaddeaddeaddeaddeaddeaddead1111"
WBTC = "0xc96de26018a54d51c097160568752c4e3bd6c364"
USDC = "0x09bc4e0d864854c6afb6eb9a9cdf58ac190d0df9"


def _pos(token_id, t0, t1, liquidity="1000000000000000000"):
    return {
        "tokenId": token_id,
        "owner": "0xabc",
        "token0": t0,
        "token1": t1,
        "fee": 3000,
        "tickLower": -887220,
        "tickUpper": 887220,
        "liquidity": liquidity,
        "tokensOwed0": "0",
        "tokensOwed1": "0",
    }


# --- correlation -------------------------------------------------------------

def test_correlation_empty_positions():
    out = compute_correlation([], [])
    assert out["tokens"] == []
    assert out["riskConcentration"] == 0.0
    assert out["provenance"]["label"] == "EMULATED"


def test_correlation_single_token():
    out = compute_correlation([_pos("1", WMNT, WMNT)], [])
    assert out["riskConcentration"] == 0.0
    assert out["provenance"]["label"] == "EMULATED"


def test_correlation_matrix_is_square_and_symmetric_diagonal_one():
    positions = [_pos("1", WMNT, USDC), _pos("2", WETH, USDC)]
    out = compute_correlation(positions, [])
    tokens = out["tokens"]
    assert set(tokens) == {WMNT, USDC, WETH}
    for t in tokens:
        assert out["matrix"][t][t] == 1.0
    # symmetry
    for a in tokens:
        for b in tokens:
            assert out["matrix"][a][b] == out["matrix"][b][a]


def test_correlation_uses_supplied_price_history_closes():
    # Caller-supplied priceHistory (closes form) must be used over a cold cache.
    positions = [_pos("1", WMNT, WETH), _pos("2", WBTC, WETH)]
    price_history = [
        {"token": WMNT, "closes": [100, 110, 100, 110, 100, 110, 100]},
        {"token": WETH, "closes": [100, 110, 100, 110, 100, 110, 100]},  # +1 vs WMNT
        {"token": WBTC, "closes": [100, 90, 100, 90, 100, 90, 100]},     # -1 vs WMNT
    ]
    out = compute_correlation(positions, price_history)
    assert out["provenance"]["label"] == "COMPUTED"
    assert out["matrix"][WMNT][WETH] > 0.9
    assert out["matrix"][WMNT][WBTC] < -0.9


def test_correlation_supplied_price_history_prices_form():
    # The {prices:[{price}]} form (CoinGecko-like) is also accepted.
    positions = [_pos("1", WMNT, WETH)]
    positions.append(_pos("2", WBTC, WETH))
    price_history = [
        {"token": WMNT, "prices": [{"price": p} for p in [100, 101, 102, 103, 104, 105, 106]]},
        {"token": WETH, "prices": [{"price": p} for p in [100, 101, 102, 103, 104, 105, 106]]},
        {"token": WBTC, "prices": [[0, 100], [1, 99], [2, 98], [3, 97], [4, 96], [5, 95], [6, 94]]},
    ]
    out = compute_correlation(positions, price_history)
    assert out["provenance"]["label"] == "COMPUTED"


def test_correlation_with_warm_cache_is_computed(monkeypatch):
    # Inject synthetic warm closes so correlation computes without network.
    # Correlation is computed on daily RETURNS, not price levels. Use opposite
    # day-to-day moves to get anti-correlation, identical moves for +1.
    monkeypatch.setattr(
        bybit,
        "get_cached_closes",
        lambda symbol, days=7: {
            "MNTUSDT": [100, 110, 100, 110, 100, 110, 100],  # up,down,up,down,...
            "ETHUSDT": [100, 110, 100, 110, 100, 110, 100],  # same moves as MNT -> +1
            "BTCUSDT": [100, 90, 100, 90, 100, 90, 100],     # opposite moves -> -1
        }.get(symbol),
    )
    positions = [_pos("1", WMNT, WETH), _pos("2", WBTC, WETH)]
    out = compute_correlation(positions, [])
    assert out["provenance"]["label"] == "COMPUTED"
    # MNT and ETH series move together -> ~ +1
    assert out["matrix"][WMNT][WETH] > 0.9
    # BTC anti-correlated with MNT/ETH -> ~ -1
    assert out["matrix"][WMNT][WBTC] < -0.9
    assert out["riskConcentration"] > 0.9


# --- optimization ------------------------------------------------------------

def test_optimize_empty():
    out = compute_optimize([], None, {})
    assert out["optimalWeights"] == {}
    assert out["provenance"]["label"] == "EMULATED"


def test_optimize_weights_sum_to_one():
    positions = [
        _pos("1", WMNT, USDC, "5000000000000000000"),
        _pos("2", WETH, USDC, "2000000000000000000"),
    ]
    out = compute_optimize(positions, None, {"dryRun": True})
    weights = out["optimalWeights"]
    assert set(weights.keys()) == {"1", "2"}
    assert abs(sum(weights.values()) - 1.0) < 1e-6


def test_optimize_handles_fallback_correlation_shape():
    # BE Agent's fallback object (no matrix key) must not crash.
    positions = [_pos("1", WMNT, USDC), _pos("2", WETH, USDC)]
    fallback = {"method": "pair-exposure-bps", "correlatedExposureBps": "1200", "concentrationBps": "8000"}
    out = compute_optimize(positions, fallback, {})
    assert abs(sum(out["optimalWeights"].values()) - 1.0) < 1e-6


def test_optimize_actions_reference_valid_token_ids():
    positions = [
        _pos("11", WMNT, USDC, "9000000000000000000"),
        _pos("22", WETH, USDC, "1000000000000000000"),
    ]
    out = compute_optimize(positions, None, {})
    for action in out["actions"]:
        assert action["tokenId"] in {"11", "22"}
        assert action["type"] in {"REDUCE", "INCREASE", "CLOSE"}
        assert "/" in action["pool"]


# --- simulation --------------------------------------------------------------

def test_simulate_baseline_expands_to_all_scenarios():
    positions = [_pos("1", WMNT, USDC), _pos("2", WETH, USDC)]
    out = compute_simulate(positions, ["baseline"])
    names = {r["scenario"] for r in out["results"]}
    assert names == {"HOLD", "REBALANCE", "CONSOLIDATE_DUST"}


def test_simulate_is_deterministic_with_seed():
    positions = [_pos("1", WMNT, USDC, "5000000000000000000")]
    a = compute_simulate(positions, ["HOLD"], seed=7)
    b = compute_simulate(positions, ["HOLD"], seed=7)
    assert a["results"] == b["results"]


def test_simulate_il_is_non_positive_and_fees_non_negative():
    positions = [_pos("1", WMNT, USDC, "5000000000000000000")]
    out = compute_simulate(positions, ["HOLD", "REBALANCE", "CONSOLIDATE_DUST"])
    for r in out["results"]:
        assert r["projectedIL"] <= 0.0
        assert r["projectedFees"] >= 0.0


def test_simulate_empty_positions():
    out = compute_simulate([], ["baseline"])
    assert all(r["projectedPnL"] == 0.0 for r in out["results"])
    assert out["provenance"]["label"] == "EMULATED"


# --- tee signing -------------------------------------------------------------

def test_developer_key_sign_shape():
    out = tee_sign.sign_report({"a": 1}, {"b": 2}, "0xdeadbeef")
    assert out["provider"] == "developer-key"
    assert out["signature"].startswith("0x")
    assert out["attestationHash"].startswith("0x")
    assert out["provenance"]["label"] == "EMULATED"
    # attestation is valid JSON for developer-key
    json.loads(out["attestation"])


def test_developer_key_sign_is_deterministic():
    a = tee_sign.sign_report({"a": 1}, {"b": 2}, "0xabc")
    b = tee_sign.sign_report({"a": 1}, {"b": 2}, "0xabc")
    assert a["signature"] == b["signature"]


def test_resolve_provider_off_enclave_is_developer_key():
    # No dstack socket and no /dev/nsm in CI/laptop -> developer-key.
    assert tee_sign.resolve_provider() == "developer-key"
    assert tee_sign.tee_active() is False


def test_resolve_provider_prefers_phala_when_socket_present(monkeypatch):
    from tee import phala
    monkeypatch.setattr(phala, "device_present", lambda: True)
    assert tee_sign.resolve_provider() == "phala"
    assert tee_sign.tee_active() is True


def test_phala_falls_back_to_developer_key_when_quote_fails(monkeypatch):
    from tee import phala
    monkeypatch.setattr(phala, "device_present", lambda: True)

    def boom(*_a, **_k):
        raise RuntimeError("dstack unreachable")

    monkeypatch.setattr(phala, "sign", boom)
    out = tee_sign.sign_report({"a": 1}, {"b": 2}, "0xabc")
    # Degrades gracefully to developer-key with EMULATED label, never raises.
    assert out["provider"] == "developer-key"
    assert out["provenance"]["label"] == "EMULATED"
    assert "Phala dstack TDX attestation failed" in out["provenance"]["warnings"][0]


def test_report_data_hex_is_32_bytes():
    from tee.common import report_data_hex
    rd = report_data_hex({"a": 1}, {"b": 2}, "0xabc")
    assert rd.startswith("0x")
    assert len(rd) == 66  # 0x + 64 hex chars = 32 bytes
