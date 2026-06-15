# @lp-guardian/server

Hono backend for LP Guardian's BE Agent workstream.

## Current Priority

The active BE Agent scope follows
`../../docs/portfolio_lp_guardian_technical_docs.md`: portfolio-level diagnosis
with the canonical six-agent direction
`SCAN -> CORRELATE -> SIMULATE -> OPTIMIZE -> EXECUTE -> MONITOR`.
See `../../docs/be-agent-priority.md` for the repo execution plan aligned to
that brief.

## Current Runtime

The server defaults to safe mock providers:

```env
AGENT_RUNTIME=mock
STRATEGIST_PROVIDER=mock
```

Runtime status is available at:

```http
GET /agent/runtime
```

## MCP Adapter

The MCP server lives in `apps/mcp-server` and is a thin STDIO adapter over the
same HTTP backend services used by the web app. It does not implement a second
diagnosis pipeline.

Run the backend first:

```bash
pnpm --filter @lp-guardian/server dev
```

Then run the MCP server:

```bash
LPGUARDIAN_API_URL=http://localhost:3001 pnpm --filter @lp-guardian/mcp-server dev
```

Available tools:

- `lp_guardian_ping`
- `portfolio_diagnose`
- `portfolio_simulate`
- `portfolio_optimize`
- `portfolio_execute`
- `portfolio_monitor`

Every product tool returns provenance fields such as `label`, `warnings`,
`mockUsed`, and `degraded` alongside the backend result. Legacy
`lp_guardian_*` tool names remain as compatibility aliases, but the public MCP
surface follows the portfolio tool names from the technical docs. Tool outputs
preserve backend errors instead of turning degraded or mismatched ownership into
a recommendation.

The response shows the selected runtime, strategist provider, and whether the
ElizaOS or Phala paths are ready.

Run the selected agent runtime with:

```http
GET /agent/foundation/run
POST /agent/foundation/run
Content-Type: application/json

{
  "walletAddress": "0x0000000000000000000000000000000000000000",
  "scenario": "dust-and-correlation"
}
```

When `AGENT_RUNTIME=eliza`, this endpoint initializes and uses the ElizaOS
runtime bridge and the `SUMMARIZE_LP_RISK` Eliza action for strategist advice.

## ElizaOS Runtime

ElizaOS is installed in the server workspace and wired through
`ElizaAgentRuntime`. The runtime currently initializes the LP Guardian
character and plugin, then returns the same structured foundation-run contract
as the mock runtime.

Use it with:

```env
AGENT_RUNTIME=eliza
STRATEGIST_PROVIDER=mock
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-1.5-flash
```

Smoke test the runtime without starting the server:

```bash
pnpm --filter @lp-guardian/server agent:smoke
pnpm --filter @lp-guardian/server agent:test
```

Current boundary:

- Eliza runtime initialization and LP Guardian plugin registration are real.
- The foundation-run envelope is server-native and labeled `mode: "eliza"`.
- Strategy advice comes from the configured `StrategistAdapter`; the default
  Eliza runtime path uses the registered `SUMMARIZE_LP_RISK` Eliza action and
  calls Gemini when `GEMINI_API_KEY` is present. Without the key, the same action
  falls back to deterministic local advice and marks `modelBacked: false`.
- Phala-verified strategist output is the next attested integration step.

## Phala Plan

`PhalaStrategistAdapter` is a placeholder until these are finalized:

- agent contract address
- signer policy
- attestation verification policy
- fallback behavior when the provider is unavailable

Until then, strategist output must be labeled `EMULATED`.

## Robinhood NFPM Transfer Scan

The no-mock demo path starts by discovering real LP NFT token ids for one of
the canonical Robinhood wallets. Set these values first:

```env
ROBINHOOD_RPC=https://robinhood-testnet.g.alchemy.com/v2/<YOUR_API_KEY>
ROBINHOOD_CHAIN_ID=46630
ROBINHOOD_NFPM_ADDRESS=0x...
ROBINHOOD_V3_FACTORY_ADDRESS=0x...
ROBINHOOD_SCAN_FROM_BLOCK=0
ROBINHOOD_SCAN_CHUNK_SIZE=10
```

Then scan either demo wallet:

```bash
pnpm --filter @lp-guardian/server scan:robinhood-transfers -- --wallet=mixed
pnpm --filter @lp-guardian/server scan:robinhood-transfers -- --wallet=bleeding
```

The script scans `Transfer` events from the configured
`NonfungiblePositionManager`, verifies current ownership with `ownerOf`, and
prints the currently owned token ids plus raw position snapshots from
`positions(tokenId)`.

Some RPC providers cap `eth_getLogs` ranges. Keep `ROBINHOOD_SCAN_CHUNK_SIZE=10`
for free-tier providers, or raise it only when the provider supports wider log
queries.

## Wallet-First Portfolio Positions

The wallet-first Robinhood path is exposed here:

```http
GET /api/portfolio/:walletAddress/positions
```

The endpoint scans the configured Robinhood NFPM, verifies current `ownerOf`
for candidate token ids, reads `positions(tokenId)`, and returns only currently
owned positions plus the derived aggregate `portfolioRiskInput`.

If `ROBINHOOD_V3_FACTORY_ADDRESS` is configured, the backend also resolves each
position pool and reads `slot0().tick` so `outOfRangePositions` is computed from
real pool state. Without that factory address, `outOfRangePositions` remains
`0` and the report source is marked `UNAVAILABLE`.

## Robinhood Contract Smoke Test

These reads do not send transactions:

```bash
pnpm --filter @lp-guardian/server smoke:robinhood-contracts
```

The script verifies RPC chain id, reads `reportCount(subjectId)` from
`PortfolioReportRegistry`, and calls `PortfolioRiskEngine.computeRisk(...)`.

## Canonical Robinhood Smoke Test

After setting a known wallet/token pair in local `.env`:

```env
ROBINHOOD_CANONICAL_WALLET_ADDRESS=0x...
ROBINHOOD_CANONICAL_TOKEN_ID=...
```

Run:

```bash
pnpm --filter @lp-guardian/server canonical:smoke
```

This validates the canonical token with `ownerOf(tokenId)` and redacts the
address/token from the output. Add `-- --scan=true` only after
`ROBINHOOD_SCAN_FROM_BLOCK` is close enough for the configured RPC log-range
limits.

## Aggregate Risk Pipeline

This runs the BE report pipeline without NFPM data. It is useful while waiting
for the position manager address because it exercises the real risk engine and
produces the final report root format:

```bash
pnpm --filter @lp-guardian/server risk:pipeline -- --wallet=mixed
```

By default, it does not publish a transaction. It returns the
`publishReport(...)` arguments that an external signer or future backend signer
can submit.

Publishing from the backend requires a funded signer in `WALLET_BACKEND_PK` and
an explicit flag:

```bash
pnpm --filter @lp-guardian/server risk:pipeline -- --wallet=mixed --publish=true
```

Without `WALLET_BACKEND_PK`, backend auto-publish is unavailable, but the
no-mock read path, deterministic report hash, and manual/external-signing
arguments still work.

The same pipeline is exposed through a BE-only endpoint:

```http
POST /api/portfolio/diagnose
Content-Type: application/json

{
  "walletAddress": "0x4d3e3d1a38505185ba86a1b1f3084195d556bc2a",
  "tokenId": "605311",
  "subjectId": "605311",
  "riskInput": {
    "totalPositions": "10",
    "outOfRangePositions": "9",
    "dustPositions": "3",
    "correlatedExposureBps": "6000",
    "concentrationBps": "7000"
  },
  "riskInputSource": {
    "name": "External indexed wallet aggregate",
    "label": "VERIFIED",
    "notes": ["Derived from real indexed NFPM and pool-state data."]
  },
  "publishReport": false,
  "requirePhala": false
}
```

`riskInput` is optional. If omitted, the backend scans the wallet through the
configured Robinhood NFPM, verifies current ownership with `ownerOf`, reads
`positions(tokenId)`, and derives the aggregate risk input from the currently
owned positions. If supplied, `riskInput` is treated as an external aggregate
input and the endpoint preserves the compatibility path. Supplying
`riskInputSource` is strongly recommended; otherwise the report labels the
client-supplied aggregate input as `EMULATED`.

When `tokenId` is present, the endpoint validates ownership with
`ownerOf(tokenId)` on `ROBINHOOD_NFPM_ADDRESS` before running the risk pipeline:

- matching owner: continue and include `ownership.status = "verified"` in the
  report payload.
- mismatched owner: stop with `409 OWNERSHIP_MISMATCH`; no report or
  recommendation is produced.
- unavailable owner source: continue in degraded mode with
  `ownership.status = "unavailable"` and an `UNAVAILABLE` source note.

If `subjectId` is omitted or `"0"`, the endpoint uses `tokenId` as the report
anchor subject. Keep sending `subjectId` explicitly when the report subject is
not the same as the LP NFT token id.

Without `riskInput`, if no currently owned NFPM positions are found, the
endpoint returns `404 NO_POSITIONS` instead of producing a misleading low-risk
report.
