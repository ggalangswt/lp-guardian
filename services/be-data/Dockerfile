# BE Data service — portfolio math + developer-key TEE signing.
#
# Default mode: developer-key HMAC-SHA256 signing (TEE_PROVIDER=developer-key).
# No Phala Cloud hardware required. Deployable on any Docker host (Railway, etc.).
#
# To enable real TDX attestation: set TEE_PROVIDER=phala and deploy inside a
# Phala Cloud CVM with the dstack guest-agent socket bind-mounted.
FROM python:3.13-slim

WORKDIR /app

# curl is used for the container healthcheck. numpy/scipy ship manylinux wheels
# so no build deps are needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
RUN chmod +x entrypoint.sh

# Railway injects PORT dynamically; default 8000 for local dev.
EXPOSE 8000

ENV TEE_PROVIDER=developer-key

CMD ["./entrypoint.sh"]
