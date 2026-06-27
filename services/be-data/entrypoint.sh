#!/usr/bin/env bash
#
# Container entrypoint.
#
# Default mode: developer-key signing (HMAC-SHA256, no hardware TEE required).
# Phala Cloud TDX mode: set TEE_PROVIDER=phala and bind-mount the dstack socket.
# Railway: PORT is injected automatically; BE_DATA_PORT overrides it locally.
set -euo pipefail

# Railway injects PORT; BE_DATA_PORT is the local-dev override.
PORT="${PORT:-${BE_DATA_PORT:-8000}}"

exec uvicorn main:app --host 0.0.0.0 --port "${PORT}"
