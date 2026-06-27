# LP Guardian — Mantle Turing Test Edition

LP Guardian is an AI-assisted liquidity-position risk system for concentrated LPs. It scans wallet-owned LP positions, verifies ownership, computes portfolio risk, streams a diagnosis through an agent pipeline, and anchors verifiable report provenance on-chain.

The project was built as an end-to-end hackathon stack for **The Turing Test Hackathon 2026** hosted by **Mantle**: React web app, Hono backend, MCP server, ElizaOS-compatible agent runtime, Arbitrum Stylus contracts, and a Mantle Turing registry for agent identity plus on-chain decision/outcome benchmarking.

## Live Demo (Mantle Edition)

- Web app: [https://lp-guardian-web.vercel.app](https://lp-guardian-web.vercel.app)
- Backend: [https://lp-guardianserver-production.up.railway.app](https://lp-guardianserver-production.up.railway.app)
- Health check: [https://lp-guardianserver-production.up.railway.app/health](https://lp-guardianserver-production.up.railway.app/health)

## What It Does

- Wallet-first LP discovery on Robinhood Chain testnet through NFPM transfer scanning.
- Mantle-native LP discovery across Merchant Moe, Agni Finance, and Fluxion.
- Ownership validation with `ownerOf(tokenId)` before diagnosis proceeds.
- Portfolio-level risk input aggregation from real wallet positions when available.
- Agent diagnosis pipeline with correlation IDs, state tracking, retries, provenance labels, and SSE streaming.
- Autonomous monitor service for watched wallets.
- MCP tools so other AI agents can call LP Guardian through a standard interface.
- Stylus/Rust contracts for report anchoring, portfolio risk scoring, and swap replay provenance.
- Mantle Solidity registry for ERC-8004-compatible agent identity, AI decisions, benchmark outcomes, and agent score history.
- TEE-attested report path for portfolio math and optimization signatures.
- Bybit price feed and macro-regime integration.
- React dashboard for wallet lookup, portfolio positions, diagnosis phases, agent state, reports, and migration/rebalance previews.

## Architecture (Mantle Version)

```text
apps/web      React + Vite + Mantle/wagmi dashboard
apps/server   Node.js API, ElizaOS orchestration, Byreal Skills CLI integration
apps/mcp-server
              STDIO MCP adapter over the portfolio diagnostic tools
packages/core Shared TypeScript types and honesty/provenance helpers
contracts     Arbitrum Stylus Rust contracts deployed on Robinhood Chain testnet
contracts/evm Mantle Solidity registry for agent identity and Turing benchmark records
tee-attestor  Local attestation service scaffold for TEE-verdict experiments
services/be-data
              Off-chain portfolio math (NumPy/SciPy) + TEE signing service
```

High-level flow:

```text
Wallet address
  -> Robinhood NFPM scan
  -> ownerOf validation
  -> position and pool-state reads
  -> aggregate risk input
  -> 6-agent portfolio pipeline
  -> report JSON + provenance
  -> optional Robinhood Chain anchor
  -> web UI / MCP consumers
```

## Sponsor And Partner Technology

- **Mantle**: Primary L2 network for identity, decision anchoring, and yield assets (mETH, USDY).
- **Bybit**: Real-time price data and trading signals via Bybit API.
- **Byreal**: Skills CLI integration for agent interoperability.
- **AWS Nitro Enclaves**: Trusted Execution Environment for verifiable off-chain computation.
- **Chainlink**: Reliable price oracles on Mantle.

## Deployed Mantle Sepolia Contracts

Network: Mantle Sepolia (`chainId=5003`)

| Contract | Address | Purpose |
| --- | --- | --- |
| `LPGuardianTuringRegistry` | `0x...` | Anchors agent decisions and benchmark outcomes |
| `Permit2Bundler` | `0x...` | Secure transaction bundling for rebalances |
| `TEEAnchor` | `0x...` | Verifies AWS Nitro attestation reports |

## Mantle Turing Registry

The Mantle Turing path is implemented in `contracts/evm` as `LPGuardianTuringRegistry`. It follows the ERC-8004 draft direction with an ERC-721-style agent identity, agent URI, and metadata, then adds LP Guardian-specific decision and outcome records for on-chain AI benchmarking.

Default mainnet configuration:

```env
LPGUARDIAN_CHAIN_MODE=mantle
MANTLE_RPC=https://rpc.mantle.xyz
MANTLE_CHAIN_ID=5000
MANTLE_TURING_REGISTRY=0x3338C6C85399e9E9d28233a186643a5383C6c736
```

Mantle mainnet deployment:

| Contract | Address | Deploy Tx |
| --- | --- | --- |
| `LPGuardianTuringRegistry` | `0x3338C6C85399e9E9d28233a186643a5383C6c736` | `0x7a776f2c43f9460f2c95ffb7f82dcc0007df106c327b819cfd2629416d08f434` |

Mantle Sepolia deployment:

| Contract | Address | Deploy Tx |
| --- | --- | --- |
| `LPGuardianTuringRegistry` | `0x3338C6C85399e9E9d28233a186643a5383C6c736` | `0x929474928d21c3fc69ab2a565e4894213edf72befe3bebac3f828e9dc8c6f47e` |

## Quick Start

Prerequisites:

- Node.js 20+
- pnpm 9+
- Foundry (for Solidity contract development)

Install dependencies:

```bash
pnpm install
```

Copy environment defaults:

```bash
cp .env.example .env
```

Run the backend:

```bash
pnpm dev:server
```

Run the web app:

```bash
pnpm dev:web
```

## Important Environment Variables

```env
PORT=3001
NODE_ENV=development

MANTLE_RPC=https://rpc.sepolia.mantle.xyz
MANTLE_CHAIN_ID=5003
LPGUARDIAN_REGISTRY_ADDRESS=0x...

LPGUARDIAN_CHAIN_MODE=mantle
MANTLE_RPC=https://rpc.mantle.xyz
MANTLE_CHAIN_ID=5000
MANTLE_TURING_REGISTRY=

LPGUARDIAN_REPORTS_CONTRACT=0x9803be5349eedf7c28ac1914b743757ce043b7cc
LPGUARDIAN_RISK_ENGINE_CONTRACT=0x8d21329ac9d7785333cb41e187e556a8f7b81ec0
LPGUARDIAN_SWAP_REPLAY_CONTRACT=0x75191d7ca10ea9c36b88b169896d4f258702afa2
BYBIT_API_KEY=...
AWS_NITRO_ENCLAVE_URL=...

AGENT_RUNTIME=eliza
STRATEGIST_PROVIDER=python-service
```

Production frontend env should point at the backend base URL without `/api`:

```env
VITE_LPGUARDIAN_API_URL=https://lp-guardianserver-production.up.railway.app
```

## Main API Surface

```http
GET /health
GET /api/positions/:walletAddress
GET /api/portfolio/:walletAddress/positions
GET /api/diagnose/:tokenId?walletAddress=0x...
POST /api/portfolio/diagnose

GET /agent/runtime
GET /agent/monitor/:walletAddress/stream
POST /agent/monitor/:walletAddress/watch
POST /agent/orchestration/run
GET /agent/orchestration/stream/:correlationId

GET /api/turing/config
POST /api/turing/agent/register
POST /api/turing/decision
POST /api/turing/outcome
GET /api/turing/agent/:agentId
GET /api/turing/decision/:decisionId
```

The backend marks degraded or synthetic paths with provenance labels such as `VERIFIED`, `UNAVAILABLE`, or `EMULATED` so the UI and MCP consumers can avoid treating fallback data as real chain evidence.

## MCP Server

The MCP server is a STDIO adapter over the same backend services used by the web app.

Start the backend first:

```bash
pnpm dev:server
```

Run MCP:

```bash
LPGUARDIAN_API_URL=http://localhost:3001 pnpm dev:mcp
```

Registered tools:

- `lp_guardian_ping`
- `portfolio_diagnose`
- `portfolio_simulate`
- `portfolio_optimize`
- `portfolio_execute`
- `portfolio_monitor`

## Useful Scripts

```bash
pnpm build
pnpm build:server
pnpm typecheck:server
pnpm typecheck:mcp

pnpm --filter @lp-guardian/server agent:test
pnpm --filter @lp-guardian/server agent:reliability
pnpm --filter @lp-guardian/server canonical:smoke
pnpm --filter @lp-guardian/server smoke:robinhood-contracts
pnpm --filter @lp-guardian/server smoke:swap-replay
```

## Contract Development

Install Stylus tooling:

```bash
rustup target add wasm32-unknown-unknown
cargo install --force cargo-stylus
```

Run Stylus tests from each contract package:

```bash
cd contracts/portfolio-report-registry
cargo test

cd ../portfolio-risk-engine
cargo test

cd ../swap-replay-verifier
cargo test
```

See `contracts/README.md` and `contracts/CONTRACTS.md` for ABI exports, deployment commands, and `cast` smoke checks.

Run Mantle Solidity tests:

```bash
cd contracts/evm
forge test -vvv
```

## Repository Notes For Judges

- Core application code lives in `apps/server`, `apps/web`, `apps/mcp-server`, `packages/core`, and `contracts`.
- Track: AI Trading & Strategy + Agentic Wallets & Economy.
- Innovation: Turing Benchmark Trail recording AI reasoning on-chain.
- Mantle focus: native protocol support including Merchant Moe.
- The backend is intentionally wallet-first: token IDs are still supported for compatibility, but ownership is checked before token-specific diagnosis.
- Mock and fallback paths are kept for demo resilience, but they are labeled in API output and UI state.
- The Robinhood Chain testnet has no public explorer in this project, so contract addresses and deployment transaction hashes are recorded in the repo.
