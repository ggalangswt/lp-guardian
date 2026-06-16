"""Shared helpers for TEE signing: the report commitment hash."""

from __future__ import annotations

import hashlib
import json
from typing import Any


def report_commitment(input_data: Any, output_data: Any, report_hash: str) -> bytes:
    """Deterministic 32-byte commitment binding inputs+outputs+reportHash.

    This becomes the ``user_data`` (Nitro) or ``report_data`` (Phala/TDX) placed
    inside the attestation document, so the quote cryptographically proves *this*
    code produced *this* output.
    """
    payload = json.dumps(
        {
            "inputData": input_data,
            "outputData": output_data,
            "reportHash": report_hash,
        },
        sort_keys=True,
        separators=(",", ":"),
        default=str,
    )
    return hashlib.sha256(payload.encode("utf-8")).digest()


def report_data_hex(input_data: Any, output_data: Any, report_hash: str) -> str:
    """The commitment as a ``0x`` + 64-hex string (32 bytes), as dstack expects."""
    return "0x" + report_commitment(input_data, output_data, report_hash).hex()
