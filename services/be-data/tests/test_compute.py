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


def test_correlation_without_price_history_is_emulated():
    # No priceHistory and no cache -> degrade to EMULATED (no fabricated signal).
    positions = [_pos("1", WMNT, WETH), _pos("2", WBTC, WETH)]
    out = compute_correlation(positions, [])
    assert out["provenance"]["label"] == "EMULATED"
    assert out["riskConcentration"] == 0.0


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


# --- B1/B2: real covariance & vol from priceHistory --------------------------

def _ph(token, closes):
    return {"token": token, "closes": closes}


def test_build_position_risk_usable_with_full_price_history():
    from compute.returns import build_position_risk
    from compute.common import parse_positions
    positions = parse_positions([_pos("1", WMNT, WBTC), _pos("2", WETH, WBTC)])
    ph = [
        _ph(WMNT, [100, 110, 105, 120, 115, 130, 125]),
        _ph(WBTC, [100, 101, 102, 103, 104, 105, 106]),
        _ph(WETH, [100, 108, 104, 118, 112, 128, 122]),
    ]
    risk = build_position_risk(positions, ph)
    assert risk["usable"] is True
    assert risk["cov"].shape == (2, 2)
    assert len(risk["vols"]) == 2
    # A volatile pair must have higher vol than a near-flat one.
    assert risk["vols"][0] > 0


def test_build_position_risk_unusable_when_leg_missing():
    from compute.returns import build_position_risk
    from compute.common import parse_positions
    positions = parse_positions([_pos("1", WMNT, WBTC)])
    # Only one leg has prices -> cannot build, must fall back.
    risk = build_position_risk(positions, [_ph(WMNT, [1, 2, 3])])
    assert risk["usable"] is False


def test_optimize_uses_real_covariance_source_with_price_history():
    positions = [_pos("1", WMNT, WBTC, "5e18"), _pos("2", WETH, WBTC, "2e18")]
    ph = [
        _ph(WMNT, [100, 130, 90, 140, 80, 150, 70]),   # very volatile
        _ph(WBTC, [100, 100.5, 101, 101.5, 102, 102.5, 103]),  # calm
        _ph(WETH, [100, 101, 100.5, 101.5, 101, 102, 101.5]),  # calm
    ]
    out = compute_optimize(positions, None, {}, ph)
    assert out["covarianceSource"].startswith("priceHistory")
    assert out["provenance"]["label"] == "COMPUTED"
    # Risk-parity should under-weight the high-vol position (token1 = WMNT pair).
    assert out["optimalWeights"]["1"] < out["optimalWeights"]["2"]


def test_optimize_falls_back_without_price_history():
    positions = [_pos("1", WMNT, WBTC), _pos("2", WETH, WBTC)]
    out = compute_optimize(positions, None, {}, [])
    assert "unit variance" in out["covarianceSource"]


def test_simulate_uses_real_vol_source_with_price_history():
    positions = [_pos("1", WMNT, WBTC, "5e18")]
    ph = [
        _ph(WMNT, [100, 130, 90, 140, 80, 150, 70]),
        _ph(WBTC, [100, 101, 102, 103, 104, 105, 106]),
    ]
    out = compute_simulate(positions, ["HOLD"], price_history=ph)
    assert out["volatilitySource"] == "priceHistory realized volatility"


def test_simulate_falls_back_vol_without_price_history():
    positions = [_pos("1", WMNT, WBTC, "5e18")]
    out = compute_simulate(positions, ["HOLD"])
    assert "proxy" in out["volatilitySource"]


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
    # No dstack socket in CI/laptop -> developer-key.
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


# --- attestation verification -------------------------------------------------

def test_verify_developer_key_roundtrip():
    from tee.verify import verify_attestation
    from tee.common import report_commitment
    inp, outp, rh = {"positions": [1, 2]}, {"corr": 0.5}, "0xabc"
    signed = tee_sign.sign_report(inp, outp, rh)
    res = verify_attestation(signed["attestation"], inp, outp, rh, signed["provider"])
    assert res["verified"] is True
    assert res["commitment"] == "0x" + report_commitment(inp, outp, rh).hex()


def test_canon_matches_cross_language_fixtures():
    # These exact strings must equal the Node `canonicalize` output (see
    # apps/server teeVerify). Locks the cross-language contract.
    from tee.common import _canon
    assert _canon({"b": 1, "a": 2}) == '{"a":2,"b":1}'      # sorted keys
    assert _canon(1.0) == "1"                                 # integer-valued float
    assert _canon(0.5) == "0.500000"                          # 6dp
    assert _canon(0.062202) == "0.062202"
    assert _canon([1, "x", True, None]) == '[1,"x",true,null]'


def test_verify_developer_key_detects_tampered_inputs():
    from tee.verify import verify_attestation
    signed = tee_sign.sign_report({"a": 1}, {"b": 2}, "0xabc")
    # Verify against DIFFERENT inputs -> commitment mismatch.
    res = verify_attestation(signed["attestation"], {"a": 999}, {"b": 2}, "0xabc", "developer-key")
    assert res["verified"] is False


def test_verify_hardware_binding_detects_commitment():
    import base64
    from tee.verify import verify_attestation
    from tee.common import report_commitment
    inp, outp, rh = {"x": 1}, {"y": 2}, "0xfeed"
    commitment = report_commitment(inp, outp, rh)
    # Simulate a quote whose report_data embeds our commitment.
    fake_quote = b"\x00" * 568 + commitment + b"\x11" * 32 + b"\x00" * 100
    attestation = base64.b64encode(fake_quote).decode()
    res = verify_attestation(attestation, inp, outp, rh, "phala")
    assert res["verified"] is True
    assert res["commitmentBound"] is True


def test_verify_hardware_binding_fails_for_wrong_commitment():
    import base64
    from tee.verify import verify_attestation
    fake_quote = base64.b64encode(b"\x42" * 700).decode()
    res = verify_attestation(fake_quote, {"x": 1}, {"y": 2}, "0xfeed", "phala")
    assert res["verified"] is False


# --- merchant moe / subgraphs -------------------------------------------------

def test_merchant_moe_unconfigured_is_unavailable(monkeypatch):
    from data import merchant_moe, subgraphs
    from config import Settings
    # Merchant Moe is subgraph-only (LB has no V3 NFPM) -> degrades, no network.
    monkeypatch.setattr(subgraphs, "settings", Settings(merchant_moe_subgraph_url=""))
    out = merchant_moe.fetch_positions("0xabc")
    assert out["positions"] == []
    assert out["provenance"]["label"] == "UNAVAILABLE"


def test_merchant_moe_maps_position_row():
    from data.subgraphs import _map_position
    row = {
        "id": "42",
        "owner": "0xABC",
        "liquidity": "12345",
        "tickLower": {"tickIdx": "-100"},
        "tickUpper": {"tickIdx": "100"},
        "pool": {"id": "0xpool", "feeTier": "3000",
                 "token0": {"id": "0xAAA"}, "token1": {"id": "0xBBB"}},
    }
    pos = _map_position(row, 0)
    assert pos["tokenId"] == "42"
    assert pos["token0"] == "0xaaa"
    assert pos["token1"] == "0xbbb"
    assert pos["fee"] == 3000
    assert pos["tickLower"] == -100 and pos["tickUpper"] == 100
    assert pos["liquidity"] == "12345"


def test_merchant_moe_skips_row_without_tokens():
    from data.subgraphs import _map_position
    assert _map_position({"id": "1", "liquidity": "5"}, 0) is None


# --- auth ---------------------------------------------------------------------

def test_require_auth_disabled_when_no_token(monkeypatch):
    import main
    from config import Settings
    monkeypatch.setattr(main, "settings", Settings(auth_token=""))
    # No exception regardless of header.
    main.require_auth(None)
    main.require_auth("Bearer anything")


def test_require_auth_enforced_when_token_set(monkeypatch):
    import main
    from fastapi import HTTPException
    from config import Settings
    monkeypatch.setattr(main, "settings", Settings(auth_token="secret123"))

    main.require_auth("Bearer secret123")  # correct -> no raise

    for bad in (None, "secret123", "Bearer wrong", "Basic secret123"):
        try:
            main.require_auth(bad)
            assert False, f"expected 401 for {bad!r}"
        except HTTPException as exc:
            assert exc.status_code == 401


# --- B6 hardening -------------------------------------------------------------

def test_payload_size_cap_returns_413(monkeypatch):
    import main
    from config import Settings
    from fastapi.testclient import TestClient
    monkeypatch.setattr(main, "settings", Settings(max_body_bytes=50, rate_limit_per_min=0))
    main._rate_state.clear()
    client = TestClient(main.app)
    big = {"positions": [{"blob": "x" * 500}], "priceHistory": []}
    assert client.post("/compute/correlation", json=big).status_code == 413


def test_rate_limit_returns_429(monkeypatch):
    import main
    from config import Settings
    from fastapi.testclient import TestClient
    monkeypatch.setattr(main, "settings", Settings(max_body_bytes=0, rate_limit_per_min=3))
    main._rate_state.clear()
    client = TestClient(main.app)
    small = {"positions": [], "priceHistory": []}
    codes = [client.post("/compute/correlation", json=small).status_code for _ in range(5)]
    assert codes[:3] == [200, 200, 200]
    assert 429 in codes[3:]


def test_health_open_under_hardening(monkeypatch):
    import main
    from config import Settings
    from fastapi.testclient import TestClient
    monkeypatch.setattr(main, "settings", Settings(max_body_bytes=10, rate_limit_per_min=1))
    main._rate_state.clear()
    client = TestClient(main.app)
    # GET /health is never capped/limited.
    for _ in range(5):
        assert client.get("/health").status_code == 200
