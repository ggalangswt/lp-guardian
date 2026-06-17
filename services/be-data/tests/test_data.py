"""Offline tests for the BE Data external-data adapters (gaps 1-4).

All network is mocked, so these run in CI / on a laptop with no egress.
"""

from __future__ import annotations

from config import Settings
from data import bybit, chainlink, mantle_rpc, rpc, subgraphs


# --- rpc ABI helpers ----------------------------------------------------------

def _word(value: int) -> bytes:
    return (value & ((1 << 256) - 1)).to_bytes(32, "big")


def _addr_word(addr: str) -> bytes:
    return bytes(12) + bytes.fromhex(addr.lower().removeprefix("0x"))


def test_rpc_encode_helpers():
    assert rpc.encode_uint(0) == "0" * 64
    assert rpc.encode_uint(255).endswith("ff")
    assert len(rpc.encode_uint(255)) == 64


def test_rpc_encode_address_pads_to_word():
    a = "0x" + "12" * 20
    enc = rpc.encode_address(a)
    assert len(enc) == 64
    assert enc.endswith("12" * 20)


def test_rpc_calldata_selector():
    data = rpc.calldata("decimals()")
    assert data == "0x313ce567"


def test_rpc_decode_signed_int():
    # -100 as two's complement
    neg = (-100) & ((1 << 256) - 1)
    assert rpc.decode_int(neg.to_bytes(32, "big")) == -100
    assert rpc.decode_uint(_word(100)) == 100


def test_rpc_decode_address():
    a = "0x" + "cd" * 20
    assert rpc.decode_address(_addr_word(a)) == a


# --- subgraphs (gap 1) --------------------------------------------------------

def test_subgraphs_unknown_protocol_unavailable():
    out = subgraphs.fetch_positions("nope", "0xabc")
    assert out["positions"] == []
    assert out["provenance"]["label"] == "UNAVAILABLE"


def test_subgraphs_agni_unconfigured_unavailable(monkeypatch):
    monkeypatch.setattr(subgraphs, "settings", Settings(agni_subgraph_url=""))
    out = subgraphs.fetch_positions("agni", "0xabc")
    assert out["protocol"] == "agni"
    assert out["provenance"]["label"] == "UNAVAILABLE"


def test_subgraphs_registry_covers_three_protocols():
    assert set(subgraphs.supported_protocols()) == {"merchant-moe", "agni", "fluxion"}


# --- bybit (gap 2) ------------------------------------------------------------

def test_bybit_no_symbol_map_unavailable(monkeypatch):
    monkeypatch.setattr(bybit, "settings", Settings(bybit_symbol_map={}))
    out = bybit.fetch_price_history(["0xtoken"])
    assert out["priceHistory"] == []
    assert out["provenance"]["label"] == "UNAVAILABLE"


def test_bybit_maps_closes_when_reachable(monkeypatch):
    token = "0x" + "aa" * 20
    monkeypatch.setattr(bybit, "settings", Settings(bybit_symbol_map={token: "ETHUSDT"}))

    class _Resp:
        def raise_for_status(self):
            pass

        def json(self):
            # Bybit returns newest-first rows: [start, o, h, l, close, vol, turnover]
            return {
                "retCode": 0,
                "result": {"list": [
                    ["3", "0", "0", "0", "30", "0", "0"],
                    ["2", "0", "0", "0", "20", "0", "0"],
                    ["1", "0", "0", "0", "10", "0", "0"],
                ]},
            }

    monkeypatch.setattr(bybit.httpx, "get", lambda *a, **k: _Resp())
    out = bybit.fetch_price_history([token], days=3)
    assert out["provenance"]["label"] == "VERIFIED"
    assert out["priceHistory"][0]["closes"] == [10.0, 20.0, 30.0]  # oldest-first


def test_bybit_transport_failure_degrades(monkeypatch):
    token = "0x" + "bb" * 20
    monkeypatch.setattr(bybit, "settings", Settings(bybit_symbol_map={token: "MNTUSDT"}))

    def _boom(*a, **k):
        raise RuntimeError("blocked")

    monkeypatch.setattr(bybit.httpx, "get", _boom)
    out = bybit.fetch_price_history([token])
    assert out["priceHistory"] == []
    assert out["provenance"]["label"] == "UNAVAILABLE"


# --- chainlink (gap 3) --------------------------------------------------------

def test_chainlink_no_feed_unavailable(monkeypatch):
    monkeypatch.setattr(chainlink, "settings", Settings(chainlink_feeds={}, mantle_rpc_url="x"))
    out = chainlink.fetch_price("ETH/USD")
    assert out["price"] is None
    assert out["provenance"]["label"] == "UNAVAILABLE"


def test_chainlink_reads_feed_when_configured(monkeypatch):
    feed = "0x" + "ff" * 20
    monkeypatch.setattr(
        chainlink,
        "settings",
        Settings(chainlink_feeds={"ETH/USD": feed}, mantle_rpc_url="http://rpc"),
    )

    def _fake_call(rpc_url, to, data, timeout=8.0):
        if data.startswith("0x313ce567"):  # decimals()
            return _word(8)
        # latestRoundData() -> 5 words
        answer = 2000 * 10**8
        return _word(1) + _word(answer) + _word(0) + _word(2_000_000_000) + _word(1)

    monkeypatch.setattr(chainlink.rpc, "eth_call", _fake_call)
    out = chainlink.fetch_price("ETH/USD")
    assert out["provenance"]["label"] == "VERIFIED"
    assert out["price"] == 2000.0


# --- mantle rpc fallback (gap 4) ----------------------------------------------

def test_mantle_rpc_no_nfpm_unavailable(monkeypatch):
    monkeypatch.setattr(mantle_rpc, "settings", Settings(nfpm_address="", mantle_rpc_url="x"))
    out = mantle_rpc.fetch_positions("0xabc")
    assert out["positions"] == []
    assert out["provenance"]["label"] == "UNAVAILABLE"


def test_mantle_rpc_enumerates_positions(monkeypatch):
    nfpm = "0x" + "11" * 20
    monkeypatch.setattr(
        mantle_rpc,
        "settings",
        Settings(nfpm_address=nfpm, mantle_rpc_url="http://rpc"),
    )
    token0 = "0x" + "aa" * 20
    token1 = "0x" + "bb" * 20

    def _fake_call(rpc_url, to, data, timeout=8.0):
        if data.startswith("0x70a08231"):  # balanceOf -> 1
            return _word(1)
        if data.startswith("0x2f745c59"):  # tokenOfOwnerByIndex -> 42
            return _word(42)
        if data.startswith("0x99fbab88"):  # positions(42) -> 12 words
            return (
                _word(0) + _addr_word("0x" + "00" * 20) + _addr_word(token0)
                + _addr_word(token1) + _word(3000) + _word(100) + _word(200)
                + _word(5000) + _word(0) + _word(0) + _word(0) + _word(0)
            )
        raise AssertionError("unexpected call")

    monkeypatch.setattr(mantle_rpc.rpc, "eth_call", _fake_call)
    out = mantle_rpc.fetch_positions("0x" + "cc" * 20)
    assert out["provenance"]["label"] == "VERIFIED"
    assert len(out["positions"]) == 1
    pos = out["positions"][0]
    assert pos["token0"] == token0
    assert pos["token1"] == token1
    assert pos["fee"] == 3000
    assert pos["liquidity"] == "5000"
