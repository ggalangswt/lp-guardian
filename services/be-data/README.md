# BE Data Service

Portfolio math, external data adapters, and TEE signing for LP Guardian.
Owned by **BE Lead (Data)**.

Python / FastAPI service that BE Agent (Node.js) calls over HTTP via
`BE_DATA_SERVICE_URL`. It computes correlation, optimization, and simulation,
provides on-chain / market data adapters, and signs reports either with a
**Phala Cloud Intel TDX** attestation in production or developer-key emulation
locally.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Liveness and active TEE provider |
| POST | `/compute/correlation` | Pearson correlation matrix and risk concentration |
| POST | `/compute/optimize` | Risk-parity optimal weights and rebalance actions |
| POST | `/compute/simulate` | HOLD / REBALANCE / CONSOLIDATE_DUST projections |
| POST | `/tee/sign` | Sign report commitment with Phala TDX or developer-key |
| POST | `/tee/verify` | Verify an attestation binds to given inputs/outputs |
| POST | `/prices/bybit` | Daily-close `priceHistory` from Bybit |
| POST | `/prices/chainlink` | On-chain Chainlink oracle prices |
| GET | `/positions/merchant-moe/{wallet}` | Merchant Moe positions |
| GET | `/positions/onchain/{wallet}` | NFPM positions read directly from Mantle RPC |
| GET | `/positions/{protocol}/{wallet}` | `merchant-moe`, `agni`, or `fluxion` subgraph positions |

Request/response schemas mirror `apps/server/src/services/beDataClient.ts`.
Every response carries a `provenance` object (`VERIFIED`, `COMPUTED`,
`EMULATED`, `UNAVAILABLE`, etc.) so honesty labels propagate to the UI.

## Architecture Notes

- **800ms budget.** BE Agent applies an 800ms client timeout to compute calls,
  so the request path is pure NumPy/SciPy on caller-supplied inputs.
- **Prices are attested inputs.** The Node backend can fetch price history and
  pass it into BE Data as `priceHistory`; BE Data also exposes independent
  Bybit and Chainlink adapters for cross-checks.
- **Data adapters degrade honestly.** Bybit, Chainlink, Mantle RPC, and protocol
  subgraph adapters return `UNAVAILABLE` provenance when unconfigured or
  unreachable. They do not fabricate values.
- **TEE honesty.** Only real Phala TDX attestation with verified binding may
  mark the orchestrator message `VERIFIED`. Developer-key signing is labelled
  `EMULATED`.
- **Auth.** If `BE_DATA_AUTH_TOKEN` is set, protected endpoints require
  `Authorization: Bearer <token>`. `/health` remains unauthenticated.

## TEE Provider

`tee/sign.py` resolves the provider at runtime:

1. `phala` - a dstack guest-agent socket exists, meaning Phala Cloud Intel TDX CVM.
2. `developer-key` - no socket, local HMAC emulation.

Force a provider with `TEE_PROVIDER=phala|developer-key`.

## Local Development

```bash
cd services/be-data
python3.13 -m venv venv
./venv/bin/pip install -r requirements.txt
cp .env.example .env
./venv/bin/uvicorn main:app --reload --port 8000
curl http://localhost:8000/health
```

Point the Node backend at it:

```bash
BE_DATA_SERVICE_URL=http://localhost:8000 BE_DATA_AUTH_TOKEN=optional-local-token pnpm dev:server
```

## Tests

```bash
./venv/bin/python -m pytest tests/ -q
```

`tests/test_data.py` covers the data adapters with all network mocked.

## Docker

```bash
docker compose up --build
```

## Phala Cloud

Runs the whole BE Data service inside an Intel TDX CVM, so the portfolio math
itself is attested, not just the signature. `tee/sign.py` auto-detects the
dstack socket and `/tee/sign` returns a real TDX quote (`provider: "phala"`,
`VERIFIED`).

1. Build and push an amd64 image:

```bash
cd services/be-data
docker login
docker run --privileged --rm tonistiigi/binfmt --install amd64
docker buildx create --name lpgbuilder --driver docker-container --use
docker buildx build --platform linux/amd64 \
  -t <your-dockerhub-user>/lp-guardian-be-data:latest --push .
```

2. Deploy on Phala Cloud using `docker-compose.phala.yml`, set `BE_DATA_IMAGE`
   to the pushed tag, and choose a CPU TDX instance.
3. Verify the TEE is live:

```bash
curl https://<your-cvm-url>/health
```

4. Point the Node backend at it:

```env
BE_DATA_SERVICE_URL=https://<your-cvm-url>
```

The OptimizeAgent `/tee/sign` call then returns a real TDX quote; the
orchestrator message can be marked `VERIFIED`, and the attestation hash can be
anchored on Mantle.

## Configuration

See `.env.example`. Key vars: `BE_DATA_PORT`, `BE_DATA_AUTH_TOKEN`,
`TEE_PROVIDER`, `DEVELOPER_SIGNING_KEY`, `MANTLE_RPC_URL`, `NFPM_ADDRESS`,
`CHAINLINK_FEEDS`, `BYBIT_API_BASE`, `BYBIT_SYMBOL_MAP`,
`MERCHANT_MOE_SUBGRAPH_URL`, `AGNI_SUBGRAPH_URL`, and `FLUXION_SUBGRAPH_URL`.
