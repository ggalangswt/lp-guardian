# BE Agent Interface Freeze

Version: 2026-06-15
Owner: BE Lead Agent
Status: Frozen for implementation

This document freezes the backend-facing contracts for the Mantle Turing Test
adaptation. The implementation follows the current repo route style. The brief
is treated as product direction, not as literal API paths.

## Decisions

- Public backend API keeps the existing repo prefix: `/api/*`.
- Mantle is the default chain context. Robinhood remains a legacy/fallback path.
- BE Data owns the Python/FastAPI implementation. BE Agent owns the client
  contract and degraded fallback behavior.
- `Permit2Bundler` and `TEEAnchor` are frozen as integration contracts now;
  deployed addresses can be filled in later.
- MCP remains supported. Byreal Skills will wrap the same BE Agent capability
  surface instead of creating a second pipeline.

## Agent Model

External agent names are frozen as:

| External agent | Internal pipeline target | Responsibility |
| --- | --- | --- |
| Scout | `scan` | Discover wallet LP positions and data sources. |
| Strategist | `correlate`, `simulate`, `optimize` | Compute risk, call BE Data, produce report/proposal. |
| Executor | `execute` | Validate proposal, require approval, prepare or submit execution. |
| Sentinel | `monitor` | Watch wallet state, alerts, and autonomous triggers. |

The internal names can stay in code where they are useful. API, docs, FE copy,
MCP/Byreal metadata, and report payloads should use the external names.

## Standard Envelope

Successful responses use the current repo envelope:

```json
{
  "ok": true,
  "data": {}
}
```

Failures use:

```json
{
  "ok": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": []
  }
}
```

All agent/report outputs must preserve provenance:

```ts
type ProvenanceLabel =
  | "VERIFIED"
  | "COMPUTED"
  | "ESTIMATED"
  | "EMULATED"
  | "LABELED"
  | "UNAVAILABLE";

interface Provenance {
  label: ProvenanceLabel;
  source: string;
  degraded: boolean;
  warnings: string[];
  observedAt?: number;
}
```

No recommendation should be emitted as verified when its upstream data,
computation, TEE, or chain write is unavailable.

## BE Agent to FE API

### `POST /api/portfolio/diagnose`

Starts or performs a portfolio diagnosis. This remains the canonical diagnosis
route for repo implementation.

Request:

```ts
interface DiagnoseRequest {
  walletAddress: `0x${string}`;
  protocols?: ("merchant-moe" | "agni" | "fluxion" | "uniswap-v3")[];
  chainId?: 5000 | 5003;
  tokenId?: string;
  subjectId?: string;
  riskInput?: PortfolioRiskInput;
  riskInputSource?: Provenance;
  publishReport?: boolean;
  recordTuringDecision?: boolean;
  requireTee?: boolean;
  teeAttestationHash?: `0x${string}`;
}
```

Response data:

```ts
interface DiagnoseResponse {
  correlationId: string;
  status: "completed" | "queued" | "failed" | "degraded";
  agents: AgentProgress[];
  report?: PortfolioReport;
  rebalanceProposal?: RebalanceProposal;
  turingDecision?: TuringDecisionRef;
  provenance: Provenance[];
}
```

Current compatibility:

- Existing `riskInput`, `riskInputSource`, `publishReport`, and token ownership
  behavior stay valid.
- `requirePhala` and `phalaAttestationHash` are legacy aliases. New clients
  should use `requireTee` and `teeAttestationHash`.

### `GET /api/portfolio/:walletAddress/positions`

Returns wallet LP positions and aggregate risk input. For Mantle, Scout should
prefer Merchant Moe data first when the adapter is implemented.

Response data:

```ts
interface PositionsResponse {
  address: `0x${string}`;
  chainId: 5000 | 5003 | 46630;
  version: number;
  source: "subgraph" | "rpc" | "mock" | "legacy-robinhood";
  positions: Position[];
  portfolioRiskInput: PortfolioRiskInput;
  sources: Provenance[];
}
```

### `POST /agent/orchestration/runs`

Queues an agent run and returns immediately.

Request:

```ts
interface AgentRunRequest {
  walletAddress: `0x${string}`;
  tokenId?: string;
  scenario?: string;
  idempotencyKey?: string;
  targetAgent?: "scan" | "correlate" | "simulate" | "optimize" | "execute" | "monitor";
  dryRun?: boolean;
  userApproved?: boolean;
  publishReport?: boolean;
  recordTuringDecision?: boolean;
  requireTee?: boolean;
  teeAttestationHash?: `0x${string}`;
}
```

Response data:

```ts
interface AgentRunResponse {
  run: AgentRun;
  messages: AgentMessage[];
}
```

### `GET /agent/orchestration/stream/:correlationId`

Streams agent run events using Server-Sent Events.

Frozen event names:

- `agent.run.snapshot`
- `agent.run.queued`
- `agent.run.running`
- `agent.step.resumed`
- `agent.step.retry_scheduled`
- `positions.scanned`
- `portfolio.correlated`
- `portfolio.simulated`
- `portfolio.optimized`
- `portfolio.executed`
- `portfolio.alert`
- `agent.run.completed`
- `agent.run.dead_lettered`
- `stream.complete`

Each event data payload must include `correlationId` directly or through the
embedded message/run object.

### `POST /api/portfolio/execute`

Frozen as the public execution entrypoint. Implementation may initially proxy
to the existing Executor/orchestration path.

Request:

```ts
interface ExecuteRequest {
  walletAddress: `0x${string}`;
  proposalHash: `0x${string}`;
  permit2Signature?: `0x${string}`;
  dryRun?: boolean;
  userApproved?: boolean;
}
```

Response data:

```ts
interface ExecuteResponse {
  status: "preview" | "waiting_for_user" | "submitted" | "disabled";
  proposalHash: `0x${string}`;
  txHash?: `0x${string}`;
  chainId: 5000 | 5003;
  contract?: `0x${string}`;
  provenance: Provenance[];
}
```

Until `Permit2Bundler` is deployed, non-dry-run execution must return a
degraded/disabled response and must not fake a transaction hash.

### `GET /agent/monitor/:walletAddress`

Returns Sentinel state for a wallet.

Response data:

```ts
interface MonitorStatus {
  walletAddress: `0x${string}`;
  status: "watching" | "idle" | "degraded";
  alerts: Alert[];
  lastRun?: AgentRun;
  provenance: Provenance[];
}
```

### `GET /.well-known/mcp-server`

Discovery endpoint for MCP-compatible clients.

Response data:

```ts
interface McpServerDiscovery {
  name: "lp-guardian";
  version: string;
  transport: "stdio" | "http";
  tools: string[];
  baseUrl: string;
  chainId: 5000 | 5003;
  provenance: Provenance;
}
```

## BE Agent to BE Data API

BE Data owns service implementation. BE Agent freezes the request/response
contract and will call it through `BE_DATA_SERVICE_URL` when available.

Default local URL:

```env
BE_DATA_SERVICE_URL=http://localhost:8000
```

### `POST /compute/correlation`

Request:

```ts
interface CorrelationRequest {
  positions: Position[];
  priceHistory: PricePoint[];
}
```

Response:

```ts
interface CorrelationResponse {
  matrix: Record<string, Record<string, number>>;
  tokens: string[];
  riskConcentration: number;
  provenance: Provenance;
}
```

### `POST /compute/optimize`

Request:

```ts
interface OptimizeRequest {
  positions: Position[];
  correlation: CorrelationResponse;
  constraints: OptimizationConstraints;
}
```

Response:

```ts
interface OptimizeResponse {
  optimalWeights: Record<string, number>;
  actions: RebalanceAction[];
  expectedReturn: number;
  expectedRisk: number;
  provenance: Provenance;
}
```

### `POST /compute/simulate`

Request:

```ts
interface SimulateRequest {
  positions: Position[];
  scenarios: string[];
}
```

Response:

```ts
interface SimulateResponse {
  results: SimulationResult[];
  provenance: Provenance;
}
```

### `POST /tee/sign`

Request:

```ts
interface TeeSignRequest {
  inputData: unknown;
  outputData: unknown;
  reportHash: `0x${string}`;
}
```

Response:

```ts
interface TeeSignResponse {
  signature: `0x${string}`;
  attestation: string;
  attestationHash: `0x${string}`;
  provider: "phala" | "developer-key" | "mock";
  provenance: Provenance;
}
```

If BE Data is unavailable, BE Agent may continue only when the request permits
degraded mode. Degraded strategist output must be labeled `EMULATED` or
`UNAVAILABLE`.

## BE Agent to Smart Contracts

### `LPGuardianTuringRegistry`

Current route support:

- `POST /api/turing/agent/register`
- `POST /api/turing/decision`
- `POST /api/turing/outcome`
- `GET /api/turing/agent/:agentId`
- `GET /api/turing/decision/:decisionId`

Pipeline integration target:

- Strategist can call `recordDecision` after a report/proposal exists.
- Sentinel can call `recordOutcome` after a simulated or verified result exists.

### `Permit2Bundler`

Frozen capability:

```solidity
function executeRebalance(bytes32 proposalHash, bytes calldata permit2Signature)
  external
  returns (bytes32 executionId);

function validateProposal(bytes32 proposalHash) external view returns (bool);
```

Environment placeholder:

```env
LPGUARDIAN_PERMIT2_BUNDLER=
```

### `TEEAnchor`

Frozen capability:

```solidity
function anchorReport(bytes32 reportHash, bytes32 attestationHash, string calldata metadataURI)
  external
  returns (bytes32 anchorId);

function verifyReport(bytes32 reportHash, bytes32 attestationHash) external view returns (bool);
```

Environment placeholder:

```env
LPGUARDIAN_TEE_ANCHOR=
```

## Shared Data Types

```ts
interface Position {
  tokenId: number;
  protocol: "merchant-moe" | "agni" | "fluxion" | "uniswap-v3";
  chainId: 5000 | 5003 | 46630;
  poolAddress: string;
  token0: TokenWithPrice;
  token1: TokenWithPrice;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  currentValueUSD: number;
  initialValueUSD?: number;
  feesEarnedUSD: number;
  ilUSD: number;
  netPnL: number;
  apr: number;
  isInRange: boolean;
  isDust: boolean;
  ageDays: number;
  provenance: Provenance;
}

interface PortfolioRiskInput {
  totalPositions: string;
  outOfRangePositions: string;
  dustPositions: string;
  correlatedExposureBps: string;
  concentrationBps: string;
}

interface PortfolioReport {
  portfolioHash: string;
  reportHash: `0x${string}`;
  owner: `0x${string}`;
  timestamp: number;
  chainId: 5000 | 5003 | 46630;
  healthScore: number;
  riskLevel: "green" | "amber" | "red";
  totalValueUSD: number;
  totalPositions: number;
  correlationMatrix?: Record<string, Record<string, number>>;
  rebalanceProposal?: RebalanceProposal;
  alerts: Alert[];
  teeAttestation?: string;
  anchoredOnChain: boolean;
  provenance: Provenance[];
}

interface RebalanceProposal {
  proposalHash: `0x${string}`;
  expiresAt: number;
  expectedPnL: number;
  expectedAPR: number;
  expectedRiskConcentration: number;
  gasEstimateUSD: number;
  slippageEstimate: number;
  actions: RebalanceAction[];
}
```

## Error Codes

Frozen common error codes:

- `BAD_REQUEST`
- `NO_POSITIONS`
- `OWNERSHIP_MISMATCH`
- `BE_DATA_UNAVAILABLE`
- `TEE_UNAVAILABLE`
- `TURING_REGISTER_FAILED`
- `TURING_DECISION_FAILED`
- `TURING_OUTCOME_FAILED`
- `EXECUTION_SUBMISSION_DISABLED`
- `CONTRACT_NOT_CONFIGURED`
- `AGENT_RUN_FAILED`

## Implementation Priority

1. Keep existing `/api/portfolio/*` and `/agent/orchestration/*` behavior stable.
2. Switch default chain context to Mantle.
3. Add external agent-name mapping for Scout, Strategist, Executor, Sentinel.
4. Add BE Data client and degraded fallback.
5. Add Turing auto-record from Strategist output.
6. Add `/api/portfolio/execute` and `/.well-known/mcp-server`.
7. Add Byreal Skills definitions over the same capabilities.
8. Replace Robinhood-first scanner with Merchant Moe-first Scout adapter.
