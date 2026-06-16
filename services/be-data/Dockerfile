# BE Data service — portfolio math + TEE signing.
#
# This image runs both locally (developer-key signing) and as the basis for an
# AWS Nitro Enclave Image File (EIF). Inside an enclave the kernel exposes
# /dev/nsm and tee/nitro.py switches to real hardware attestation automatically.
#
# For a Nitro build, the recommended base is Amazon Linux 2023 with the NSM
# libraries; the slim base below works for local dev and the EIF build path that
# bundles libnsm separately (see build_eif.sh).
FROM python:3.13-slim

WORKDIR /app

# socat bridges vsock<->TCP inside the enclave; curl is used for the readiness
# probe in entrypoint.sh. numpy/scipy ship manylinux wheels so no build deps.
RUN apt-get update \
    && apt-get install -y --no-install-recommends socat curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh

EXPOSE 8000

# entrypoint.sh auto-detects enclave (/dev/nsm) vs local and wires networking.
CMD ["./entrypoint.sh"]
