#!/usr/bin/env bash
#
# Bridge host TCP <-> enclave vsock so the Node backend can call the BE Data
# service running inside the Nitro enclave over plain HTTP.
#
# Run this on the EC2 host after the enclave is up (see build_eif.sh). Then set
# BE_DATA_SERVICE_URL=http://localhost:8000 for the Node backend.
#
# Requires socat. Install on Amazon Linux: sudo yum install -y socat
set -euo pipefail

ENCLAVE_CID="${ENCLAVE_CID:-16}"
ENCLAVE_PORT="${ENCLAVE_PORT:-8000}"
HOST_PORT="${HOST_PORT:-8000}"

echo "==> Proxying host 127.0.0.1:${HOST_PORT} -> enclave vsock ${ENCLAVE_CID}:${ENCLAVE_PORT}"
exec socat \
  "TCP-LISTEN:${HOST_PORT},reuseaddr,fork" \
  "VSOCK-CONNECT:${ENCLAVE_CID}:${ENCLAVE_PORT}"
