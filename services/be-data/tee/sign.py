"""TEE signing dispatcher.

Resolves the active provider and signs the report commitment. Detection is
``auto`` by default: if ``/dev/nsm`` exists we use AWS Nitro, otherwise we fall
back to developer-key signing. The provider can be forced via ``TEE_PROVIDER``.
"""

from __future__ import annotations

import time

from config import settings

from . import developer_key, nitro
from .common import report_commitment  # re-exported for tests


def resolve_provider() -> str:
    configured = (settings.tee_provider or "auto").lower()
    if configured == "nitro":
        return "nitro"
    if configured == "developer-key":
        return "developer-key"
    # auto
    return "nitro" if nitro.device_present() else "developer-key"


def tee_active() -> bool:
    return resolve_provider() == "nitro"


def sign_report(input_data, output_data, report_hash: str) -> dict:
    provider = resolve_provider()

    if provider == "nitro":
        try:
            result = nitro.sign(input_data, output_data, report_hash)
            result["provenance"] = {
                "label": "VERIFIED",
                "source": "BE Data /tee/sign (AWS Nitro NSM)",
                "degraded": False,
                "warnings": [],
                "observedAt": int(time.time() * 1000),
            }
            return result
        except Exception as exc:  # noqa: BLE001 - fall back rather than 500
            fallback = developer_key.sign(input_data, output_data, report_hash)
            fallback["provenance"] = {
                "label": "EMULATED",
                "source": "BE Data /tee/sign (Nitro failed -> developer-key)",
                "degraded": True,
                "warnings": [f"Nitro attestation failed: {exc}"],
                "observedAt": int(time.time() * 1000),
            }
            return fallback

    result = developer_key.sign(input_data, output_data, report_hash)
    result["provenance"] = {
        "label": "EMULATED",
        "source": "BE Data /tee/sign (developer-key)",
        "degraded": True,
        "warnings": ["Developer-key signing is not a hardware TEE attestation."],
        "observedAt": int(time.time() * 1000),
    }
    return result


__all__ = ["sign_report", "resolve_provider", "tee_active", "report_commitment"]
