"""On-chain position fallback via Mantle RPC (no subgraph required).

When a protocol subgraph is unavailable, we can still enumerate a wallet's LP
positions directly from the chain by reading a Uniswap-V3-style
``NonfungiblePositionManager`` (NFPM) over read-only ``eth_call``:

    balanceOf(owner)                  -> number of position NFTs
    tokenOfOwnerByIndex(owner, i)     -> tokenId of the i-th NFT
    positions(tokenId)                -> (…, token0, token1, fee, tickLower,
                                          tickUpper, liquidity, …)

Results map to the same wire shape the compute endpoints expect, so this is a
drop-in cross-check / fallback for the subgraph path. Configure the NFPM address
via ``NFPM_ADDRESS`` and the RPC via ``MANTLE_RPC_URL``. Degrades gracefully to
``UNAVAILABLE`` provenance (never fabricates positions) when unconfigured or the
chain read fails.
"""

from __future__ import annotations

import logging

from compute.common import (
    LABEL_UNAVAILABLE,
    LABEL_VERIFIED,
    provenance,
)
from config import settings

from . import rpc

logger = logging.getLogger("be-data.mantle-rpc")

_SOURCE = "Mantle RPC (NFPM on-chain)"

# Cap enumeration so a whale wallet can't make us issue thousands of calls.
_MAX_POSITIONS = 200


def _balance_of(rpc_url: str, nfpm: str, owner: str) -> int:
    data = rpc.calldata("balanceOf(address)", rpc.encode_address(owner))
    words = rpc.call_words(rpc_url, nfpm, data)
    if not words:
        raise rpc.RpcError("balanceOf returned nothing")
    return rpc.decode_uint(words[0])


def _token_of_owner(rpc_url: str, nfpm: str, owner: str, index: int) -> int:
    data = rpc.calldata(
        "tokenOfOwnerByIndex(address,uint256)",
        rpc.encode_address(owner),
        rpc.encode_uint(index),
    )
    words = rpc.call_words(rpc_url, nfpm, data)
    if not words:
        raise rpc.RpcError("tokenOfOwnerByIndex returned nothing")
    return rpc.decode_uint(words[0])


def _position(rpc_url: str, nfpm: str, token_id: int) -> dict | None:
    data = rpc.calldata("positions(uint256)", rpc.encode_uint(token_id))
    words = rpc.call_words(rpc_url, nfpm, data)
    # NFPM.positions returns 12 words:
    # 0 nonce, 1 operator, 2 token0, 3 token1, 4 fee, 5 tickLower, 6 tickUpper,
    # 7 liquidity, 8/9 feeGrowth, 10 tokensOwed0, 11 tokensOwed1.
    if len(words) < 8:
        return None
    return {
        "tokenId": str(token_id),
        "token0": rpc.decode_address(words[2]).lower(),
        "token1": rpc.decode_address(words[3]).lower(),
        "fee": rpc.decode_uint(words[4]),
        "tickLower": rpc.decode_int(words[5]),
        "tickUpper": rpc.decode_int(words[6]),
        "liquidity": str(rpc.decode_uint(words[7])),
        "tokensOwed0": str(rpc.decode_uint(words[10])) if len(words) > 10 else "0",
        "tokensOwed1": str(rpc.decode_uint(words[11])) if len(words) > 11 else "0",
    }


def fetch_positions(wallet: str) -> dict:
    """Enumerate ``wallet``'s NFPM positions directly from Mantle."""
    rpc_url = settings.mantle_rpc_url
    nfpm = settings.nfpm_address

    if not nfpm:
        return {
            "positions": [],
            "provenance": provenance(
                LABEL_UNAVAILABLE, _SOURCE, ["NFPM_ADDRESS is not configured."]
            ),
        }
    if not rpc_url:
        return {
            "positions": [],
            "provenance": provenance(
                LABEL_UNAVAILABLE, _SOURCE, ["MANTLE_RPC_URL is not configured."]
            ),
        }

    try:
        balance = _balance_of(rpc_url, nfpm, wallet)
        count = min(balance, _MAX_POSITIONS)
        positions: list[dict] = []
        for i in range(count):
            token_id = _token_of_owner(rpc_url, nfpm, wallet, i)
            pos = _position(rpc_url, nfpm, token_id)
            # Skip fully-closed positions (zero liquidity).
            if pos and pos["token0"] and pos["token1"] and int(pos["liquidity"]) > 0:
                positions.append(pos)
    except rpc.RpcError as exc:
        logger.warning("Mantle RPC position fetch failed for %s: %s", wallet, exc)
        return {
            "positions": [],
            "provenance": provenance(LABEL_UNAVAILABLE, _SOURCE, [f"RPC read failed: {exc}"]),
        }

    warnings: list[str] = []
    if balance > _MAX_POSITIONS:
        warnings.append(f"Wallet has {balance} positions; capped enumeration at {_MAX_POSITIONS}.")
    return {
        "positions": positions,
        "provenance": provenance(LABEL_VERIFIED, _SOURCE, warnings),
    }
