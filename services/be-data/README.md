# BE Data Service

Portfolio math + external data + TEE signing for LP Guardian. Owned by
**BE Lead (Data)**.

Python / FastAPI service that BE Agent (Node.js) calls over HTTP via
`BE_DATA_SERVICE_URL`. It computes correlation, optimization, and simulation,
provides on-chain / market data adapters (Chainlink, Bybit, Mantle RPC, protocol
subgraphs), and signs reports either with a **Phala Cloud Intel TDX** attestation
(in production) or a developer-key emulation (local).

## Endpoints

| Method | Path                              | Purpose |
| ------ | --------------------------------- | ------- |
| GET    | `/health`                         | Liveness + active TEE provider |
| POST   | `/compute/correlation`            | Pearson correlation matrix + risk concentration |
| POST   | `/compute/optimize`               | Risk-parity optimal weights + rebalance actions |
| POST   | `/compute/simulate`               | HOLD / REBALANCE / CONSOLIDATE_DUST projections |
| POST   | `/tee/sign`                       | Sign report commitment (Phala TDX / developer-key) |
| POST   | `/tee/verify`                     | Verify an attestation binds to given inputs/outputs |
| POST   | `/prices/bybit`                   | Daily-close `priceHistory` from Bybit (token→symbol map) |
| POST   | `/prices/chainlink`               | On-chain Chainlink oracle prices (fallback) |
| GET    | `/positions/merchant-moe/{wallet}`| Merchant Moe positions (subgraph → on-chain RPC fallback) |
| GET    | `/positions/onchain/{wallet}`     | NFPM positions read directly from Mantle RPC |
| GET    | `/positions/{protocol}/{wallet}`  | `merchant-moe` \| `agni` \| `fluxion` subgraph positions |

Request/response schemas mirror `apps/server/src/services/beDataClient.ts`.
Every response carries a `provenance` object (`VERIFIED` / `COMPUTED` /
`EMULATED` / `UNAVAILABLE` / …) so the honesty labels propagate to the UI.

## Architecture notes

- **800ms budget.** BE Agent applies an 800ms client timeout to compute calls,
  so the request path is pure NumPy/SciPy on caller-supplied inputs (no network).
- **Prices are attested inputs (primary path).** The TEE CVM has limited egress,
  so the Node backend fetches price history (CoinGecko) and passes it in as
  `priceHistory`; the correlation is still computed inside the CVM. Missing
  prices degrade to an identity matrix + `EMULATED` (no fabricated signal).
- **Data adapters (independent / cross-check).** `data/bybit.py`,
  `data/chainlink.py`, `data/mantle_rpc.py`, and `data/subgraphs.py` let BE Data
  fetch market/on-chain data itself. All degrade to `UNAVAILABLE` provenance —
  never fabricated values — when a source is unconfigured or unreachable.
- **Chainlink is the must-have oracle fallback.** `data/chainlink.py` reads
  `AggregatorV3.latestRoundData()` over `eth_call`, so a price comes straight
  from an on-chain contract when off-chain APIs are down.
- **Positions are raw NFPM snapshots** (`token0`/`token1` are addresses, no USD
  value). `liquidity` is the position-size proxy.
- **TEE honesty.** Only a real hardware attestation (`phala` TDX) marks the
  orchestrator message `VERIFIED`. Developer-key signing is labelled `EMULATED`
  and never masquerades as hardware attestation. `/tee/verify` checks the
  attestation binds to the exact inputs/outputs (structural + report_data
  binding; full Intel DCAP cert-chain verification is out of scope).

## TEE provider (auto-detected)

`tee/sign.py` resolves the provider at runtime, in priority order:

1. **`phala`** — a dstack guest-agent socket (`/var/run/dstack.sock`) exists →
   Phala Cloud Intel TDX CVM. **Recommended** (cheapest, chain-agnostic, reuses
   the repo's existing `tee-attestor` protocol).
2. **`developer-key`** — no socket → local HMAC emulation (EMULATED).

Force a provider with `TEE_PROVIDER=phala|developer-key`.

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

`tests/test_data.py` covers the data adapters with all network mocked.

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

### What needs your input vs. what's done

- **Done (no config):** all compute + signing code, provider auto-detection
  (Phala dstack / developer-key), data adapters, Dockerfile, `entrypoint.sh`,
  `docker-compose.phala.yml`, developer-key fallback.
- **You configure (Phala, recommended):** build/push the amd64 image, create a
  Phala Cloud TDX CVM from `docker-compose.phala.yml`, set `BE_DATA_SERVICE_URL`.
- **You configure (data sources, optional):** `MANTLE_RPC_URL`, `NFPM_ADDRESS`,
  `CHAINLINK_FEEDS`, `BYBIT_SYMBOL_MAP`, and the protocol subgraph URLs. All are
  optional — each adapter degrades to `UNAVAILABLE` until set.

## Configuration

See `.env.example`. Key vars: `BE_DATA_PORT`, `BE_DATA_AUTH_TOKEN`,
`TEE_PROVIDER` (`auto`|`phala`|`developer-key`), `DEVELOPER_SIGNING_KEY`,
`MANTLE_RPC_URL`, `NFPM_ADDRESS`, `CHAINLINK_FEEDS`, `BYBIT_API_BASE`,
`BYBIT_SYMBOL_MAP`, `MERCHANT_MOE_SUBGRAPH_URL`, `AGNI_SUBGRAPH_URL`,
`FLUXION_SUBGRAPH_URL`.
