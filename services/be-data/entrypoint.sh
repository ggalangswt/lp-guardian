#!/usr/bin/env bash
#
# Container/enclave entrypoint.
#
# Off-enclave (local/docker): just run uvicorn on TCP 0.0.0.0:8000.
#
# In-enclave: the enclave has NO network interface — only vsock. So we run
# uvicorn bound to loopback and bridge an inbound vsock listener to it with
# socat. The host side runs vsock_proxy.sh (TCP -> vsock) to complete the path.
set -euo pipefail

PORT="${BE_DATA_PORT:-8000}"
VSOCK_PORT="${ENCLAVE_VSOCK_PORT:-8000}"

if [ -e /dev/nsm ]; then
  echo "[entrypoint] /dev/nsm detected -> enclave mode (vsock ${VSOCK_PORT} -> 127.0.0.1:${PORT})"
  uvicorn main:app --host 127.0.0.1 --port "${PORT}" &
  # Wait for uvicorn to accept connections.
  for _ in $(seq 1 30); do
    if curl -sf "http://127.0.0.1:${PORT}/health" >/dev/null 2>&1; then break; fi
    sleep 0.5
  done
  exec socat "VSOCK-LISTEN:${VSOCK_PORT},reuseaddr,fork" "TCP-CONNECT:127.0.0.1:${PORT}"
else
  echo "[entrypoint] no /dev/nsm -> local mode (TCP 0.0.0.0:${PORT}, developer-key signing)"
  exec uvicorn main:app --host 0.0.0.0 --port "${PORT}"
fi
