"""Minimal Ethereum JSON-RPC + ABI helper (dependency-free, httpx only).

Used by the on-chain data adapters (``chainlink.py`` for Chainlink price feeds,
``mantle_rpc.py`` for the NFPM position fallback). We hand-roll the tiny slice of
ABI encoding/decoding we need instead of pulling in ``web3``/``eth-abi`` so the
TEE image stays small and auditable.

Only ``eth_call`` (read-only) is supported — this service never sends
transactions. Function selectors are hard-coded (well-known 4-byte values) so we
don't need a keccak implementation.
"""

from __future__ import annotations

import logging

import httpx

logger = logging.getLogger("be-data.rpc")

# Well-known 4-byte selectors (first 4 bytes of keccak256 of the signature).
SELECTORS = {
    "latestRoundData()": "0xfeaf968c",
    "latestAnswer()": "0x50d25bcd",
    "decimals()": "0x313ce567",
    "balanceOf(address)": "0x70a08231",
    "tokenOfOwnerByIndex(address,uint256)": "0x2f745c59",
    "positions(uint256)": "0x99fbab88",
}


class RpcError(RuntimeError):
    """Raised when the RPC endpoint errors or returns an unusable response."""


def encode_address(addr: str) -> str:
    """Left-pad a 20-byte address to a 32-byte ABI word (no 0x)."""
    clean = addr.lower().removeprefix("0x")
    if len(clean) != 40:
        raise ValueError(f"bad address: {addr}")
    return clean.rjust(64, "0")


def encode_uint(value: int) -> str:
    """Encode a non-negative integer as a 32-byte ABI word (no 0x)."""
    if value < 0:
        raise ValueError("encode_uint is for non-negative integers")
    return f"{value:064x}"


def calldata(signature: str, *words: str) -> str:
    """Build calldata: 4-byte selector + 32-byte ABI words."""
    selector = SELECTORS[signature]
    return selector + "".join(words)


def _word(data: bytes, index: int) -> bytes:
    start = index * 32
    return data[start : start + 32]


def decode_uint(word: bytes) -> int:
    return int.from_bytes(word, "big")


def decode_int(word: bytes) -> int:
    """Decode a two's-complement signed integer from a 32-byte word."""
    value = int.from_bytes(word, "big")
    if value >= 1 << 255:
        value -= 1 << 256
    return value


def decode_address(word: bytes) -> str:
    return "0x" + word[12:].hex()


def eth_call(rpc_url: str, to: str, data: str, timeout: float = 8.0) -> bytes:
    """Perform a read-only ``eth_call`` and return the raw return bytes.

    Raises ``RpcError`` on transport/JSON-RPC errors so callers can degrade.
    """
    if not rpc_url:
        raise RpcError("RPC URL is not configured.")
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "eth_call",
        "params": [{"to": to, "data": data if data.startswith("0x") else "0x" + data}, "latest"],
    }
    try:
        resp = httpx.post(rpc_url, json=payload, timeout=timeout)
        resp.raise_for_status()
        body = resp.json()
    except Exception as exc:  # noqa: BLE001 - normalize to RpcError
        raise RpcError(f"eth_call transport failed: {exc}") from exc

    if isinstance(body, dict) and body.get("error"):
        raise RpcError(f"eth_call RPC error: {str(body['error'])[:200]}")
    result = body.get("result") if isinstance(body, dict) else None
    if not isinstance(result, str) or not result.startswith("0x"):
        raise RpcError("eth_call returned no result.")
    try:
        return bytes.fromhex(result[2:])
    except ValueError as exc:
        raise RpcError(f"eth_call returned non-hex result: {exc}") from exc


def call_words(rpc_url: str, to: str, data: str, timeout: float = 8.0) -> list[bytes]:
    """``eth_call`` returning the result split into 32-byte words."""
    raw = eth_call(rpc_url, to, data, timeout)
    return [_word(raw, i) for i in range(len(raw) // 32)]
