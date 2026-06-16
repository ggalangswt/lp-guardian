"""AWS Nitro Enclaves attestation via the Nitro Security Module (NSM).

This module is fully implemented but **dormant** until the service runs inside a
Nitro enclave (i.e. ``/dev/nsm`` exists). ``tee/sign.py`` only dispatches here
when the device is present, so on a laptop / plain container this code never
runs and never needs AWS configuration.

Mechanism
---------
Inside an enclave, the NSM exposes a device at ``/dev/nsm``. We request a signed
attestation document whose ``user_data`` field carries our 32-byte report
commitment. The document is a COSE_Sign1 / CBOR blob signed by the AWS Nitro
attestation PKI — proving this exact code produced this output inside a genuine
enclave.

Two access paths are supported:
  1. ``libnsm`` via ctypes (the official aws-nitro-enclaves-nsm-api shared lib).
  2. A raw ioctl fallback against ``/dev/nsm`` using the NSM CBOR protocol.

The server stores ``keccak256(attestation)`` style hashes on Mantle; the raw
document is returned base64 in the ``attestation`` field.
"""

from __future__ import annotations

import base64
import ctypes
import fcntl
import hashlib
import os

import cbor2

from .common import report_commitment

NSM_DEVICE = "/dev/nsm"

# ioctl magic for the NSM char device. Mirrors the kernel definition:
#   #define NSM_IOCTL_MAGIC 0x0A
#   #define NSM_IOCTL_PROCESS_REQUEST _IOWR(NSM_IOCTL_MAGIC, 0, struct nsm_iovec_pair)
_NSM_IOCTL_MAGIC = 0x0A
_IOC_NRBITS, _IOC_TYPEBITS, _IOC_SIZEBITS = 8, 8, 14
_IOC_NRSHIFT = 0
_IOC_TYPESHIFT = _IOC_NRSHIFT + _IOC_NRBITS
_IOC_SIZESHIFT = _IOC_TYPESHIFT + _IOC_TYPEBITS
_IOC_DIRSHIFT = _IOC_SIZESHIFT + _IOC_SIZEBITS
_IOC_WRITE, _IOC_READ = 1, 2


class _Iovec(ctypes.Structure):
    _fields_ = [("iov_base", ctypes.c_void_p), ("iov_len", ctypes.c_size_t)]


class _NsmMessage(ctypes.Structure):
    _fields_ = [("request", _Iovec), ("response", _Iovec)]


def _ioc(direction: int, size: int) -> int:
    return (
        (direction << _IOC_DIRSHIFT)
        | (_NSM_IOCTL_MAGIC << _IOC_TYPESHIFT)
        | (0 << _IOC_NRSHIFT)
        | (size << _IOC_SIZESHIFT)
    )


def device_present() -> bool:
    return os.path.exists(NSM_DEVICE)


# --- libnsm (preferred) ------------------------------------------------------

def _try_libnsm(commitment: bytes) -> bytes | None:
    try:
        lib = ctypes.CDLL("libnsm.so")
    except OSError:
        return None

    lib.nsm_lib_init.restype = ctypes.c_int32
    lib.nsm_get_attestation_doc.restype = ctypes.c_int32
    lib.nsm_get_attestation_doc.argtypes = [
        ctypes.c_int32,
        ctypes.c_char_p, ctypes.c_uint32,  # user_data
        ctypes.c_char_p, ctypes.c_uint32,  # nonce
        ctypes.c_char_p, ctypes.c_uint32,  # public_key
        ctypes.c_char_p, ctypes.POINTER(ctypes.c_uint32),  # att_doc, len
    ]

    fd = lib.nsm_lib_init()
    if fd < 0:
        return None

    buf_len = ctypes.c_uint32(16 * 1024)
    buf = ctypes.create_string_buffer(buf_len.value)
    rc = lib.nsm_get_attestation_doc(
        fd,
        commitment, len(commitment),
        None, 0,
        None, 0,
        buf, ctypes.byref(buf_len),
    )
    if rc != 0:
        return None
    return buf.raw[: buf_len.value]


# --- raw ioctl fallback ------------------------------------------------------

def _try_ioctl(commitment: bytes) -> bytes | None:
    request = cbor2.dumps({"Attestation": {"user_data": commitment}})
    resp_buf = ctypes.create_string_buffer(16 * 1024)
    req_buf = ctypes.create_string_buffer(request, len(request))

    msg = _NsmMessage()
    msg.request.iov_base = ctypes.cast(req_buf, ctypes.c_void_p)
    msg.request.iov_len = len(request)
    msg.response.iov_base = ctypes.cast(resp_buf, ctypes.c_void_p)
    msg.response.iov_len = len(resp_buf)

    op = _ioc(_IOC_READ | _IOC_WRITE, ctypes.sizeof(_NsmMessage))
    fd = os.open(NSM_DEVICE, os.O_RDWR)
    try:
        fcntl.ioctl(fd, op, msg)
    finally:
        os.close(fd)

    raw = resp_buf.raw[: msg.response.iov_len]
    decoded = cbor2.loads(raw)
    # Response shape: {"Attestation": {"document": <bytes>}}
    doc = decoded.get("Attestation", {}).get("document") if isinstance(decoded, dict) else None
    return doc


def sign(input_data, output_data, report_hash: str) -> dict:
    commitment = report_commitment(input_data, output_data, report_hash)

    attestation_doc = _try_libnsm(commitment)
    if attestation_doc is None:
        attestation_doc = _try_ioctl(commitment)
    if not attestation_doc:
        raise RuntimeError("NSM present but attestation document could not be obtained.")

    attestation_b64 = base64.b64encode(attestation_doc).decode("ascii")
    attestation_hash = hashlib.sha256(attestation_doc).hexdigest()

    return {
        # The COSE signature lives inside the document; expose the commitment as
        # the signature handle and the full doc as the attestation.
        "signature": "0x" + hashlib.sha256(commitment).hexdigest(),
        "attestation": attestation_b64,
        "attestationHash": "0x" + attestation_hash,
        "provider": "aws-nitro",
    }
