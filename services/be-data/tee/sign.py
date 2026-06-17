"""TEE signing dispatcher.

Resolves the active provider and signs the report commitment. ``auto`` keeps
local development on developer-key unless a supported hardware TEE is detected.
Production is expected to run inside Phala TDX/CVM; the legacy Nitro path stays
available only as a backward-compatible provider implementation.
"""

from __future__ import annotations

import time

from config import settings

from . import developer_key, nitro
from .common import report_commitment  # re-exported for tests


def resolve_provider() -> str:
    configured = (settings.tee_provider or "auto").lower()
    if configured in {"phala", "phala-tdx"}:
        return "phala-tdx"
    if configured in {"nitro", "aws-nitro"}:
        return "nitro"
    if configured == "developer-key":
        return "developer-key"
    # auto
    return "nitro" if nitro.device_present() else "developer-key"


def tee_active() -> bool:
    provider = resolve_provider()
    if provider == "nitro":
        return nitro.device_present()
    return False


def sign_report(input_data, output_data, report_hash: str) -> dict:
    provider = resolve_provider()

    if provider == "phala-tdx":
        fallback = developer_key.sign(input_data, output_data, report_hash)
        fallback["provenance"] = {
            "label": "EMULATED",
            "source": "BE Data /tee/sign (Phala TDX quote unavailable -> developer-key)",
            "degraded": True,
            "warnings": [
                "TEE_PROVIDER is Phala, but this BE Data service does not yet have a local Phala/dstack quote adapter.",
            ],
            "observedAt": int(time.time() * 1000),
        }
        return fallback

    if provider == "nitro":
        try:
            result = nitro.sign(input_data, output_data, report_hash)
            result["provenance"] = {
                "label": "VERIFIED",
                "source": "BE Data /tee/sign (legacy Nitro NSM)",
                "degraded": False,
                "warnings": [
                    "Legacy Nitro provider is retained only for backward compatibility; production target is Phala TDX/CVM.",
                ],
                "observedAt": int(time.time() * 1000),
            }
            return result
        except Exception as exc:  # noqa: BLE001 - fall back rather than 500
            fallback = developer_key.sign(input_data, output_data, report_hash)
            fallback["provenance"] = {
                "label": "EMULATED",
                "source": "BE Data /tee/sign (TEE failed -> developer-key)",
                "degraded": True,
                "warnings": [f"TEE attestation failed: {exc}"],
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
