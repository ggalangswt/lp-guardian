# BE Data Service

Portfolio math + TEE signing for LP Guardian. Owned by **BE Lead (Data)**.

Python / FastAPI service that BE Agent (Node.js) calls over HTTP via
`BE_DATA_SERVICE_URL`. It computes correlation, optimization, and simulation,
fetches its own price history from Bybit, and signs reports either with an AWS
Nitro Enclave attestation (in production) or a developer-key emulation (local).

## Endpoints

| Method | Path                   | Purpose |
| ------ | ---------------------- | ------- |
| GET    | `/health`              | Liveness + active TEE provider + cache status |
| POST   | `/compute/correlation` | Pearson correlation matrix + risk concentration |
| POST   | `/compute/optimize`    | Risk-parity optimal weights + rebalance actions |
| POST   | `/compute/simulate`    | HOLD / REBALANCE / CONSOLIDATE_DUST projections |
| POST   | `/tee/sign`            | Sign report commitment (Nitro or developer-key) |

Request/response schemas mirror `apps/server/src/services/beDataClient.ts`.
Every response carries a `provenance` object (`COMPUTED` / `EMULATED` / …) so the
honesty labels propagate to the UI.

## Architecture notes

- **800ms budget.** BE Agent applies an 800ms client timeout. The request path
  is therefore **cache-first**: prices come from an in-memory cache that a
  background task pre-warms on startup and refreshes on an interval. Cache misses
  degrade gracefully (identity correlation + `EMULATED`) instead of blocking.
- **Positions are raw NFPM snapshots** (`token0`/`token1` are addresses, no USD
  value). `liquidity` is the position-size proxy. `data/bybit.py` maps known
  Mantle token addresses to Bybit spot symbols.
- **TEE honesty.** Only a real `aws-nitro` attestation marks the orchestrator
  message `VERIFIED`. Developer-key signing is labelled `EMULATED` and never
  masquerades as hardware attestation.

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

## AWS Nitro Enclaves (production TEE) — requires your configuration

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

- **Done (no config):** all compute + signing code, enclave auto-detection,
  `libnsm`/ioctl attestation path, Dockerfile, `entrypoint.sh`, `build_eif.sh`,
  `vsock_proxy.sh`, and the developer-key fallback for local dev.
- **You configure:** the EC2 Nitro instance, allocator, running `build_eif.sh` /
  `vsock_proxy.sh`, and setting `BE_DATA_SERVICE_URL`. Optionally a `BYBIT_API_KEY`
  (public API works for the demo).

## Configuration

See `.env.example`. Key vars: `BE_DATA_PORT`, `BYBIT_API_BASE`, `BYBIT_API_KEY`,
`TEE_PROVIDER` (`auto`|`nitro`|`developer-key`), `DEVELOPER_SIGNING_KEY`.
