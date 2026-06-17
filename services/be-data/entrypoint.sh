#!/usr/bin/env bash
#
# Container entrypoint.
#
# The BE Data service runs as a normal container — locally (developer-key
# signing) or inside a Phala Cloud Intel TDX CVM, where the dstack guest-agent
# socket is bind-mounted and tee/sign.py switches to real TDX attestation
# automatically. Either way we just serve uvicorn on TCP 0.0.0.0:8000.
set -euo pipefail

PORT="${BE_DATA_PORT:-8000}"

exec uvicorn main:app --host 0.0.0.0 --port "${PORT}"
