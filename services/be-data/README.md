# BE Data Service

Portfolio math + TEE signing for LP Guardian. Owned by **BE Lead (Data)**.

Python / FastAPI service that BE Agent (Node.js) calls over HTTP via
`BE_DATA_SERVICE_URL`. It computes correlation, optimization, and simulation,
fetches its own price history from Bybit, and signs reports either with an AWS
Nitro Enclave attestation (in production) or a developer-key emulation (local).

## Endpoints

| Method | Path                              | Purpose |
| ------ | --------------------------------- | ------- |
| GET    | `/health`                         | Liveness + active TEE provider |
| POST   | `/compute/correlation`            | Pearson correlation matrix + risk concentration |
| POST   | `/compute/optimize`               | Risk-parity optimal weights + rebalance actions |
| POST   | `/compute/simulate`               | HOLD / REBALANCE / CONSOLIDATE_DUST projections |
| POST   | `/tee/sign`                       | Sign report commitment (Phala / Nitro / developer-key) |
| POST   | `/tee/verify`                     | Verify an attestation binds to given inputs/outputs |
| GET    | `/positions/merchant-moe/{wallet}`| Optional: fetch LP positions from the Merchant Moe subgraph |

Request/response schemas mirror `apps/server/src/services/beDataClient.ts`.
Every response carries a `provenance` object (`COMPUTED` / `EMULATED` / …) so the
honesty labels propagate to the UI.

## Architecture notes

- **800ms budget.** BE Agent applies an 800ms client timeout to compute calls,
  so the request path is pure NumPy/SciPy on caller-supplied inputs (no network).
- **Prices are attested inputs.** The TEE CVM has no egress, so the Node backend
  fetches price history (CoinGecko) and passes it in as `priceHistory`; the
  correlation is still computed inside the enclave. Missing prices degrade to an
  identity matrix + `EMULATED` (no fabricated signal).
- **Positions are raw NFPM snapshots** (`token0`/`token1` are addresses, no USD
  value). `liquidity` is the position-size proxy.
- **TEE honesty.** Only a real hardware attestation (`phala` TDX or `aws-nitro`)
  marks the orchestrator message `VERIFIED`. Developer-key signing is labelled
  `EMULATED` and never masquerades as hardware attestation. `/tee/verify` checks
  the attestation binds to the exact inputs/outputs (structural + report_data
  binding; full Intel DCAP cert-chain verification is out of scope).

## TEE provider (auto-detected)

`tee/sign.py` resolves the provider at runtime, in priority order:

1. **`phala`** — a dstack guest-agent socket (`/var/run/dstack.sock`) exists →
   Phala Cloud Intel TDX CVM. **Recommended** (cheapest, chain-agnostic, reuses
   the repo's existing `tee-attestor` protocol).
2. **`nitro`** — `/dev/nsm` exists → AWS Nitro Enclave.
3. **`developer-key`** — neither → local HMAC emulation (EMULATED).

Force a provider with `TEE_PROVIDER=phala|nitro|developer-key`.

## Local development

```bash
cd services/be-data
python3.13 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env

# run
./venv/bin/uvicorn main:app --reload --port 8000

# smoke test
curl http://localhost:8000/health
```

Point the Node backend at it:

```bash
BE_DATA_SERVICE_URL=http://localhost:8000 pnpm dev:server
```

## Tests

```bash
./venv/bin/python -m pytest tests/ -q
```

## Docker (local)

```bash
docker compose up --build
```

## Phala Cloud (recommended TEE) — requires your configuration

Runs the **whole BE Data service inside an Intel TDX CVM**, so the portfolio
math itself is attested — not just the signature. `tee/sign.py` auto-detects the
dstack socket and `/tee/sign` returns a real TDX quote (`provider: "phala"`,
`VERIFIED`). Covered by Phala Cloud's free **$20 CVM credits**.

1. **Build + push an amd64 image** (Phala TDX runs `linux/amd64`; cross-build on
   Apple Silicon with buildx):
   ```bash
   cd services/be-data
   docker login
   docker run --privileged --rm tonistiigi/binfmt --install amd64   # one-time
   docker buildx create --name lpgbuilder --driver docker-container --use  # one-time
   docker buildx build --platform linux/amd64 \
     -t <your-dockerhub-user>/lp-guardian-be-data:latest --push .
   ```
2. **Deploy on Phala Cloud** (https://cloud.phala.com/dashboard → Create CVM):
   - Choose **Advanced / docker-compose** and paste `docker-compose.phala.yml`
     (set `BE_DATA_IMAGE` to your pushed tag).
   - Pick a **CPU (TDX)** instance — smallest is fine, **NOT GPU**.
   - Deploy. Copy the CVM public URL (e.g. `https://xxxx-8000.dstack-prod5.phala.network`).
3. **Verify the TEE is live:**
   ```bash
   curl https://<your-cvm-url>/health
   # → {"ok":true,"tee_provider":"phala","tee_active":true,...}
   ```
4. **Point the Node backend at it:**
   ```env
   BE_DATA_SERVICE_URL=https://<your-cvm-url>
   ```
   The OptimizeAgent's `/tee/sign` call now returns a real TDX quote; the
   orchestrator message is marked `VERIFIED` and the attestation hash can be
   anchored on Mantle. Keep Phala **auto-topup OFF** so it pauses instead of
   charging if credits run out.

## AWS Nitro Enclaves (alternative TEE) — requires your configuration

The code auto-detects the enclave (`/dev/nsm`) and switches `tee/sign.py` to real
NSM attestation. Everything below is what **you** run on the EC2 host; no code
changes are needed.

1. **Launch an EC2 instance with Nitro Enclaves enabled** (e.g. `m5.xlarge`),
   `--enclave-options Enabled=true`. Install Docker, `nitro-cli`, and `socat`,
   and start the allocator service.
2. **Copy this directory** to the instance.
3. **Build + run the enclave:**
   ```bash
   ./build_eif.sh
   ```
   Record the printed **PCR0** measurement — that is the code identity you can
   anchor on-chain (Mantle `codeHash`).
4. **Bridge host TCP → enclave vsock:**
   ```bash
   ./vsock_proxy.sh        # host 127.0.0.1:8000 -> enclave vsock 16:8000
   ```
   (Inside the enclave, `entrypoint.sh` already runs the matching vsock→uvicorn
   bridge — there is no network interface in an enclave, only vsock.)
5. **Point the backend at the proxy:**
   ```env
   BE_DATA_SERVICE_URL=http://localhost:8000
   ```
6. Verify `GET /health` now reports `"tee_provider": "nitro"`, `"tee_active": true`.

### What needs your input vs. what's done

- **Done (no config):** all compute + signing code, provider auto-detection
  (Phala dstack / Nitro NSM / developer-key), Dockerfile, `entrypoint.sh`,
  `docker-compose.phala.yml`, `build_eif.sh`, `vsock_proxy.sh`, developer-key
  fallback.
- **You configure (Phala, recommended):** build/push the amd64 image, create a
  Phala Cloud TDX CVM from `docker-compose.phala.yml`, set `BE_DATA_SERVICE_URL`.
- **You configure (Nitro, alternative):** EC2 Nitro instance + allocator, run
  `build_eif.sh` / `vsock_proxy.sh`, set `BE_DATA_SERVICE_URL`.

## Configuration

See `.env.example`. Key vars: `BE_DATA_PORT`, `BYBIT_API_BASE`, `BYBIT_API_KEY`,
`TEE_PROVIDER` (`auto`|`nitro`|`developer-key`), `DEVELOPER_SIGNING_KEY`.
