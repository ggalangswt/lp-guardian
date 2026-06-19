"""TEE signing dispatcher.

Resolves the active provider and signs the report commitment. Detection is
``auto`` by default, in priority order:

  1. ``phala`` - a dstack guest-agent socket exists (Phala Cloud TDX CVM)
  2. ``developer-key`` - no socket; local/dev HMAC fallback

The provider can be forced via ``TEE_PROVIDER`` (phala | developer-key).
Only a real hardware attestation (phala TDX) is labelled VERIFIED; developer-key
is always EMULATED so it never masquerades as a TEE.
"""

from __future__ import annotations

import time

from config import settings

from . import developer_key, phala
from .common import report_commitment  # re-exported for tests

_VERIFIED_PROVIDERS = ("phala",)


def resolve_provider() -> str:
    configured = (settings.tee_provider or "auto").lower()
    if configured in ("phala", "developer-key"):
        return configured
    if phala.device_present():
        return "phala"
    return "developer-key"


def tee_active() -> bool:
    return resolve_provider() in _VERIFIED_PROVIDERS


def _provenance(label: str, source: str, warnings: list[str]) -> dict:
    return {
        "label": label,
        "source": source,
        "degraded": label != "VERIFIED",
        "warnings": warnings,
        "observedAt": int(time.time() * 1000),
    }


def _developer_key_result(input_data, output_data, report_hash, source, warnings) -> dict:
    result = developer_key.sign(input_data, output_data, report_hash)
    result["provenance"] = _provenance("EMULATED", source, warnings)
    return result


def sign_report(input_data, output_data, report_hash: str) -> dict:
    provider = resolve_provider()

    if provider in _VERIFIED_PROVIDERS:
        backend = "Phala dstack TDX"
        try:
            result = phala.sign(input_data, output_data, report_hash)
            result["provenance"] = _provenance("VERIFIED", f"BE Data /tee/sign ({backend})", [])
            return result
        except Exception as exc:  # noqa: BLE001 - degrade rather than 500
            return _developer_key_result(
                input_data,
                output_data,
                report_hash,
                f"BE Data /tee/sign ({backend} failed -> developer-key)",
                [f"{backend} attestation failed: {exc}"],
            )

    return _developer_key_result(
        input_data,
        output_data,
        report_hash,
        "BE Data /tee/sign (developer-key)",
        ["Developer-key signing is not a hardware TEE attestation."],
    )


__all__ = ["sign_report", "resolve_provider", "tee_active", "report_commitment"]
