"""Shared helpers for TEE signing: the report commitment hash.

The commitment is computed with a **cross-language canonical serializer** so the
Node backend can independently recompute and verify it (see
`apps/server/src/services/teeVerify.ts`). The rules — sorted keys, no spaces,
integer-valued numbers as plain integers, other numbers fixed to 6 decimals
(compute outputs are rounded to 6dp) — are chosen so Python and JavaScript
produce byte-identical output for the same logical data.
"""

from __future__ import annotations

import hashlib
import json
import math
from typing import Any


def _canon(value: Any) -> str:
    """Deterministic canonical JSON string, identical across Python and JS."""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):  # bool already handled above
        return str(value)
    if isinstance(value, float):
        if math.isfinite(value) and value == int(value):
            return str(int(value))
        return f"{value:.6f}"
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=True)
    if isinstance(value, dict):
        items = sorted(value.items(), key=lambda kv: str(kv[0]))
        return "{" + ",".join(f"{json.dumps(str(k))}:{_canon(v)}" for k, v in items) + "}"
    if isinstance(value, (list, tuple)):
        return "[" + ",".join(_canon(v) for v in value) + "]"
    # Fallback for unexpected types (mirror JS String()).
    return json.dumps(str(value))


def report_commitment(input_data: Any, output_data: Any, report_hash: str) -> bytes:
    """Deterministic 32-byte commitment binding inputs+outputs+reportHash.

    This becomes the ``report_data`` (Phala/TDX) placed inside the attestation
    quote, so the quote cryptographically proves *this* code produced *this*
    output.
    """
    payload = _canon(
        {
            "inputData": input_data,
            "outputData": output_data,
            "reportHash": report_hash,
        }
    )
    return hashlib.sha256(payload.encode("utf-8")).digest()


def report_data_hex(input_data: Any, output_data: Any, report_hash: str) -> str:
    """The commitment as a ``0x`` + 64-hex string (32 bytes), as dstack expects."""
    return "0x" + report_commitment(input_data, output_data, report_hash).hex()
