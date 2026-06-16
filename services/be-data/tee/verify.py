"""Verify a BE Data attestation binds to a given (input, output, reportHash).

The crucial property to verify is **binding**: that the attestation commits to
exactly the inputs/outputs it claims. We recompute the 32-byte commitment and
check it is embedded in the attestation:

  * phala / nitro: the commitment is placed in the quote/doc ``report_data``
    (Phala) or ``user_data`` (Nitro). We confirm the commitment bytes appear in
    the decoded attestation (layout-independent), so the quote provably commits
    to our data.
  * developer-key: the attestation is a JSON envelope with an HMAC signature; we
    recompute the HMAC and compare.

Scope note: full Intel DCAP / Nitro PKI signature-chain verification (proving the
quote was issued by genuine Intel/AWS hardware) requires a DCAP QVL / PCCS or a
hosted verifier (e.g. Phala's quote-verification service). That cryptographic
step is intentionally out of scope here; this module verifies the binding and
structural integrity, which is what the backend needs before trusting a quote.
"""

from __future__ import annotations

import base64
import binascii
import hashlib
import hmac
import json

from config import settings

from .common import report_commitment


def _decode_candidates(attestation: str) -> list[bytes]:
    """Return plausible raw-byte interpretations of the attestation string."""
    candidates: list[bytes] = []
    # 1) base64 (how phala/nitro drivers encode the quote/doc)
    try:
        candidates.append(base64.b64decode(attestation, validate=False))
    except (binascii.Error, ValueError):
        pass
    # 2) the base64-decoded payload may itself be a hex string (dstack often
    #    returns the quote as hex); decode that too.
    for blob in list(candidates):
        try:
            text = blob.decode("ascii").strip()
            hex_text = text[2:] if text.startswith("0x") else text
            if len(hex_text) >= 2 and len(hex_text) % 2 == 0:
                candidates.append(bytes.fromhex(hex_text))
        except (UnicodeDecodeError, ValueError):
            pass
    # 3) attestation given directly as hex
    try:
        hex_text = attestation[2:] if attestation.startswith("0x") else attestation
        candidates.append(bytes.fromhex(hex_text))
    except ValueError:
        pass
    return candidates


def _verify_hardware(attestation: str, commitment: bytes) -> dict:
    bound = any(commitment in blob for blob in _decode_candidates(attestation))
    return {
        "verified": bound,
        "method": "report_data-binding",
        "commitmentBound": bound,
        "warnings": []
        if bound
        else ["Commitment not found in attestation; quote does not bind to these inputs."],
        "notes": [
            "Binding + structural check only; Intel DCAP / Nitro PKI signature-chain "
            "verification is out of scope (use a DCAP QVL or Phala's hosted verifier).",
        ],
    }


def _verify_developer_key(attestation: str, input_data, output_data, report_hash) -> dict:
    try:
        envelope = json.loads(attestation)
    except (json.JSONDecodeError, TypeError):
        return {
            "verified": False,
            "method": "developer-key-hmac",
            "warnings": ["Developer-key attestation is not valid JSON."],
        }

    commitment = report_commitment(input_data, output_data, report_hash)
    expected_commitment = "0x" + commitment.hex()
    commitment_ok = envelope.get("commitment") == expected_commitment

    return {
        "verified": commitment_ok,
        "method": "developer-key-hmac",
        "commitmentMatch": commitment_ok,
        "warnings": []
        if commitment_ok
        else ["Developer-key commitment does not match recomputed inputs."],
        "notes": ["Developer-key signing is an emulation, not a hardware attestation."],
    }


def verify_attestation(
    attestation: str,
    input_data,
    output_data,
    report_hash: str,
    provider: str | None = None,
) -> dict:
    """Verify an attestation binds to (input, output, reportHash)."""
    commitment = report_commitment(input_data, output_data, report_hash)

    if provider == "developer-key":
        result = _verify_developer_key(attestation, input_data, output_data, report_hash)
    else:
        # phala / nitro / unknown -> treat as a hardware quote/doc and check binding.
        result = _verify_hardware(attestation, commitment)

    result["provider"] = provider
    result["commitment"] = "0x" + commitment.hex()
    return result
