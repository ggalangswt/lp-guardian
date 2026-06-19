# BE Data service — portfolio math + TEE signing.
#
# Runs locally (developer-key signing) and inside a Phala Cloud Intel TDX CVM,
# where the dstack guest-agent socket is bind-mounted and tee/sign.py switches to
# real hardware attestation automatically (see docker-compose.phala.yml).
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

EXPOSE 8000

CMD ["./entrypoint.sh"]
