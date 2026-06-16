"""Developer-key signing — local/dev fallback when no Nitro enclave is present.

Produces an HMAC-SHA256 signature over the report commitment plus a small JSON
attestation envelope. This is NOT a hardware attestation; the response is
labelled ``provider: "developer-key"`` so consumers never mistake it for a real
TEE quote.
"""

from __future__ import annotations

import hashlib
import hmac
import json
import time

from config import settings

from .common import report_commitment


def sign(input_data, output_data, report_hash: str) -> dict:
    commitment = report_commitment(input_data, output_data, report_hash)

    signature = hmac.new(
        settings.developer_signing_key.encode("utf-8"),
        commitment,
        hashlib.sha256,
    ).digest()

    attestation_obj = {
        "provider": "developer-key",
        "commitment": "0x" + commitment.hex(),
        "reportHash": report_hash,
        "signedAt": int(time.time() * 1000),
        "note": "Local developer-key signature; not a hardware TEE attestation.",
    }
    attestation = json.dumps(attestation_obj, sort_keys=True, separators=(",", ":"))
    attestation_hash = hashlib.sha256(attestation.encode("utf-8")).hexdigest()

    return {
        "signature": "0x" + signature.hex(),
        "attestation": attestation,
        "attestationHash": "0x" + attestation_hash,
        "provider": "developer-key",
    }
