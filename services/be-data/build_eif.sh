#!/usr/bin/env bash
#
# Build + run the BE Data service as an AWS Nitro Enclave.
#
# PREREQUISITES (you configure these on the EC2 host — see README "AWS Nitro"):
#   - EC2 instance with Nitro Enclaves enabled (e.g. m5.xlarge), enclave
#     allocator running, and the `nitro-cli` + `docker` tooling installed.
#   - This directory copied onto the instance.
#
# After running this, start ./vsock_proxy.sh on the host so the Node backend can
# reach the enclave over HTTP, then point BE_DATA_SERVICE_URL at the proxy.
set -euo pipefail

IMAGE_TAG="lp-guardian-be-data"
EIF_FILE="lp-guardian-be-data.eif"
ENCLAVE_CID="${ENCLAVE_CID:-16}"
ENCLAVE_CPUS="${ENCLAVE_CPUS:-2}"
ENCLAVE_MEM_MB="${ENCLAVE_MEM_MB:-2048}"

echo "==> Building Docker image"
docker build -t "${IMAGE_TAG}" .

echo "==> Building Enclave Image File (EIF)"
nitro-cli build-enclave \
  --docker-uri "${IMAGE_TAG}:latest" \
  --output-file "${EIF_FILE}"

echo "==> Terminating any prior enclave"
nitro-cli terminate-enclave --all || true

echo "==> Running enclave (CID=${ENCLAVE_CID}, CPUs=${ENCLAVE_CPUS}, Mem=${ENCLAVE_MEM_MB}MB)"
nitro-cli run-enclave \
  --cpu-count "${ENCLAVE_CPUS}" \
  --memory "${ENCLAVE_MEM_MB}" \
  --enclave-cid "${ENCLAVE_CID}" \
  --eif-path "${EIF_FILE}"

echo "==> Enclave running. Now start ./vsock_proxy.sh on the host."
echo "    The PCR0/measurements above are the code identity to record on-chain."
