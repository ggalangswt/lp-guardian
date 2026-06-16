"""Phala Cloud / dstack TDX attestation.

When the BE Data service runs inside a Phala Cloud CPU (Intel TDX) CVM, the
dstack guest-agent socket is bind-mounted at ``/var/run/dstack.sock``. We request
a TDX remote-attestation quote whose ``report_data`` commits to our 32-byte
report commitment — proving this exact code produced this output inside a genuine
TEE.

This is a Python port of the repo's existing ``tee-attestor/src/attest.mjs``
(Node) so the two stay protocol-compatible. Off-CVM (no socket) this module is
dormant and ``tee/sign.py`` falls back to developer-key signing.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os

import httpx

from .common import report_commitment, report_data_hex

logger = logging.getLogger("be-data.phala")

# dstack guest-agent socket candidates (Phala Cloud mounts the first; older
# images used tappd.sock). Overridable via DSTACK_SOCKET.
_CANDIDATE_SOCKETS = [
    os.environ.get("DSTACK_SOCKET"),
    "/var/run/dstack.sock",
    "/var/run/tappd.sock",
]


def active_socket() -> str | None:
    for sock in _CANDIDATE_SOCKETS:
        if sock and os.path.exists(sock):
            return sock
    return None


def device_present() -> bool:
    """True when a dstack guest-agent socket is present (i.e. inside a CVM)."""
    return active_socket() is not None


def _post_unix(socket_path: str, path: str, payload: dict) -> dict:
    transport = httpx.HTTPTransport(uds=socket_path)
    with httpx.Client(transport=transport, timeout=10.0) as client:
        # Host is ignored for UDS but required to form a valid URL.
        resp = client.post(f"http://dstack{path}", json=payload)
        resp.raise_for_status()
        return resp.json()


def _get_tdx_quote(report_data_hex_str: str) -> dict | None:
    """Request a TDX quote committing to report_data. Returns {quote, eventLog}."""
    socket = active_socket()
    if not socket:
        return None

    # Try the documented dstack endpoint, fall back to the older tappd RPC path.
    try:
        res = _post_unix(socket, "/GetQuote", {"reportData": report_data_hex_str})
    except Exception as first_err:  # noqa: BLE001
        try:
            res = _post_unix(
                socket,
                "/prpc/Tappd.TdxQuote?json",
                {"report_data": report_data_hex_str},
            )
        except Exception:  # noqa: BLE001
            raise first_err

    quote = res.get("quote") or res.get("tdx_quote") or res.get("tdxQuote")
    event_log = res.get("event_log") or res.get("eventLog")
    if not quote:
        return None
    return {"quote": quote, "eventLog": event_log}


def sign(input_data, output_data, report_hash: str) -> dict:
    commitment = report_commitment(input_data, output_data, report_hash)
    rd_hex = report_data_hex(input_data, output_data, report_hash)

    result = _get_tdx_quote(rd_hex)
    if not result:
        raise RuntimeError("dstack socket present but no TDX quote was returned.")

    quote = result["quote"]
    quote_bytes = quote.encode("utf-8") if isinstance(quote, str) else bytes(quote)
    attestation_b64 = base64.b64encode(quote_bytes).decode("ascii")
    attestation_hash = hashlib.sha256(quote_bytes).hexdigest()

    return {
        # The TDX quote is the proof; expose the commitment as the signature
        # handle and the raw quote (base64) as the attestation.
        "signature": "0x" + hashlib.sha256(commitment).hexdigest(),
        "attestation": attestation_b64,
        "attestationHash": "0x" + attestation_hash,
        "provider": "phala",
        "reportData": rd_hex,
    }
