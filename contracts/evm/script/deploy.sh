#!/usr/bin/env bash
set -euo pipefail

: "${MANTLE_RPC:?Set MANTLE_RPC}"
: "${WALLET_DEPLOYER_PK:?Set WALLET_DEPLOYER_PK}"

forge create \
  --rpc-url "$MANTLE_RPC" \
  --private-key "$WALLET_DEPLOYER_PK" \
  src/LPGuardianTuringRegistry.sol:LPGuardianTuringRegistry \
  --constructor-args "LP Guardian Turing Agent" "LPGTA"
