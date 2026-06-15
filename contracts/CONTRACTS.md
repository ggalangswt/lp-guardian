# LP Guardian Contract Reference

This document explains the purpose, external interface, and integration flow for the LP Guardian Stylus contracts.

## Contract Overview

LP Guardian uses Rust contracts compiled with Arbitrum Stylus for Robinhood Chain Testnet:

| Contract | Purpose | Current Address |
| --- | --- | --- |
| `PortfolioReportRegistry` | Stores verifiable report anchors keyed by `rootHash` | `0x9803be5349eedf7c28ac1914b743757ce043b7cc` |
| `PortfolioRiskEngine` | Computes deterministic portfolio risk scores from aggregate LP metrics | `0x8d21329ac9d7785333cb41e187e556a8f7b81ec0` |
| `SwapReplayVerifier` | Anchors Phala TEE replay proofs for 1,000-swap counterfactual simulations | `0x75191d7ca10ea9c36b88b169896d4f258702afa2` |

The contracts are intentionally small. Heavy portfolio indexing, LP position reconstruction, report generation, and attestation payload construction should happen off-chain. The contracts preserve the parts that benefit from on-chain verifiability: report provenance and deterministic risk scoring.

## PortfolioReportRegistry

`PortfolioReportRegistry` is an append-only registry for LP Guardian reports. A report can be generated off-chain, stored in a content-addressed storage layer, and anchored on-chain by publishing its `rootHash`. The contract does not store the full report body; it stores the compact metadata needed to prove that a report existed, who published it, and which portfolio or subject it belongs to.

### Data Model

Each report is keyed by a unique `bytes32 rootHash`.

Stored fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `portfolioOwner` | `address` | Wallet or portfolio owner analyzed by LP Guardian |
| `subjectId` | `uint256` | App-defined identifier, for example portfolio id, account id, token id, or strategy id |
| `publisher` | `address` | Address that submitted the report anchor |
| `publishedAt` | `uint256` | Block timestamp when the report was published |
| `rootHash` | `bytes32` | Root hash of the report payload or report bundle |
| `attestationHash` | `bytes32` | Hash of an attestation, model output, signature bundle, or verification metadata |

The contract also maintains a per-`subjectId` history so clients can list every report root associated with the same portfolio subject.

### Functions

#### `publishReport(address portfolio_owner, uint256 subject_id, bytes32 root_hash, bytes32 attestation_hash)`

Publishes a new report anchor.

Use this after the backend has generated a report and computed the final report root. The function records the caller as `publisher` and stores the current block timestamp as `publishedAt`.

Validation:

| Condition | Error |
| --- | --- |
| `portfolio_owner == address(0)` | `ZeroPortfolioOwner()` |
| `root_hash == bytes32(0)` | `EmptyRootHash()` |
| `root_hash` already exists | `AlreadyPublished(bytes32 rootHash)` |

Example:

```bash
cast send --rpc-url "$ROBINHOOD_RPC" \
  --private-key "$WALLET_DEPLOYER_PK" \
  0x9803be5349eedf7c28ac1914b743757ce043b7cc \
  "publishReport(address,uint256,bytes32,bytes32)" \
  0x1111111111111111111111111111111111111111 \
  605311 \
  0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa \
  0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
```

#### `getReport(bytes32 root_hash)`

Returns the stored metadata for a report root.

Return order:

```solidity
(address portfolioOwner, uint256 subjectId, address publisher, uint256 publishedAt, bytes32 rootHash, bytes32 attestationHash)
```

Example:

```bash
cast call --rpc-url "$ROBINHOOD_RPC" \
  0x9803be5349eedf7c28ac1914b743757ce043b7cc \
  "getReport(bytes32)(address,uint256,address,uint256,bytes32,bytes32)" \
  0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```

#### `reportCount(uint256 subject_id)`

Returns the number of reports associated with a subject.

Example:

```bash
cast call --rpc-url "$ROBINHOOD_RPC" \
  0x9803be5349eedf7c28ac1914b743757ce043b7cc \
  "reportCount(uint256)(uint256)" \
  605311
```

#### `reportAt(uint256 subject_id, uint256 index)`

Returns the report root at `index` for a subject.

Validation:

| Condition | Error |
| --- | --- |
| `index >= reportCount(subject_id)` | `ReportIndexOutOfBounds(uint256 index, uint256 length)` |

Example:

```bash
cast call --rpc-url "$ROBINHOOD_RPC" \
  0x9803be5349eedf7c28ac1914b743757ce043b7cc \
  "reportAt(uint256,uint256)(bytes32)" \
  605311 \
  0
```

### Intended Integration Flow

The backend should treat this contract as the final provenance layer.

1. Index portfolio or LP position data off-chain.
2. Compute risk metrics and build a report payload.
3. Hash the report payload into `rootHash`.
4. Hash the attestation or verification metadata into `attestationHash`.
5. Call `publishReport(...)`.
6. Store the returned transaction hash alongside the report API response.
7. Let the frontend verify report provenance by reading `getReport(rootHash)` or listing roots with `reportCount` and `reportAt`.

## PortfolioRiskEngine

`PortfolioRiskEngine` is a stateless compute contract. It converts aggregate portfolio metrics into a deterministic risk score, risk tier, and suggested action. It is designed to make the risk scoring policy transparent and reproducible while allowing expensive data collection to remain off-chain.

### Function

#### `computeRisk(uint256 total_positions, uint256 out_of_range_positions, uint256 dust_positions, uint256 correlated_exposure_bps, uint256 concentration_bps)`

Computes portfolio risk from aggregate metrics.

Inputs:

| Field | Type | Meaning |
| --- | --- | --- |
| `total_positions` | `uint256` | Total LP positions in the portfolio |
| `out_of_range_positions` | `uint256` | Positions currently outside active range |
| `dust_positions` | `uint256` | Positions too small or fragmented to manage efficiently |
| `correlated_exposure_bps` | `uint256` | Correlated exposure in basis points, capped at `10000` |
| `concentration_bps` | `uint256` | Portfolio concentration in basis points, capped at `10000` |

Returns:

```solidity
(uint256 riskScoreBps, uint8 riskTier, uint8 recommendedAction)
```

Return fields:

| Field | Meaning |
| --- | --- |
| `riskScoreBps` | Final risk score in basis points, from `0` to `10000` |
| `riskTier` | `0 = low`, `1 = medium`, `2 = high` |
| `recommendedAction` | `0 = hold`, `1 = rebalance`, `2 = exit or consolidate` |

Example:

```bash
cast call --rpc-url "$ROBINHOOD_RPC" \
  0x8d21329ac9d7785333cb41e187e556a8f7b81ec0 \
  "computeRisk(uint256,uint256,uint256,uint256,uint256)(uint256,uint8,uint8)" \
  10 \
  9 \
  3 \
  6000 \
  7000
```

Expected output:

```text
6650
2
2
```

### Scoring Interpretation

The engine is intentionally deterministic and explainable. It combines range health, dust fragmentation, correlated exposure, and concentration into one score. The output is not a price oracle and should not be treated as financial advice. It is a policy score that lets different clients reproduce the same risk label for the same aggregate inputs.

Suggested frontend labels:

| `riskTier` | Label |
| --- | --- |
| `0` | Low risk |
| `1` | Medium risk |
| `2` | High risk |

| `recommendedAction` | Label |
| --- | --- |
| `0` | Hold / monitor |
| `1` | Rebalance |
| `2` | Exit or consolidate |

## Backend Integration Pattern

A typical LP Guardian backend integration should use both contracts together:

1. Fetch portfolio positions from indexers, subgraphs, RPC calls, or protocol APIs.
2. Aggregate portfolio metrics such as total positions, out-of-range positions, dust count, correlation, and concentration.
3. Call `PortfolioRiskEngine.computeRisk(...)` to produce deterministic on-chain risk output.
4. Generate the full human-readable report off-chain.
5. Compute `rootHash` for the report payload and `attestationHash` for the verification metadata.
6. Call `PortfolioReportRegistry.publishReport(...)`.
7. Return the report, risk result, report root, registry transaction hash, and contract addresses to the frontend.

This keeps the on-chain surface compact while making the important outputs independently verifiable.

## SwapReplayVerifier

`SwapReplayVerifier` anchors the result of a computation-heavy swap replay. The backend scans recent pool swaps, compresses the input batch, and sends the replay job to a Phala TEE. The TEE computes the full counterfactual P&L off-chain, while this contract stores the proof metadata that lets another system verify the same replay payload was used.

This contract is not an execution router and never moves user funds. It is a replay provenance and spot-check layer.

### Data Model

Each replay proof is keyed by `bytes32 replayId`, computed from the replay metadata and hashes.

Stored fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `publisher` | `address` | Address that submitted the replay proof |
| `timestamp` | `uint256` | Block timestamp when the proof was published |
| `portfolioOwner` | `address` | Wallet or portfolio owner being analyzed |
| `subjectId` | `uint256` | App-defined portfolio, position, or strategy identifier |
| `pool` | `address` | Pool whose swaps were replayed |
| `fromBlock` | `uint256` | First block included in the replay window |
| `toBlock` | `uint256` | Last block included in the replay window |
| `swapCount` | `uint256` | Number of compressed swaps in the replay, capped at `1000` |
| `inputRoot` | `bytes32` | Hash/root of the canonical compressed swap batch |
| `resultHash` | `bytes32` | Hash of the canonical replay result |
| `attestationHash` | `bytes32` | Hash of the Phala TDX quote or attestation payload |
| `teeImageHash` | `bytes32` | Hash of the attestor code/image identity |

### Functions

#### `publishReplay(...)`

Publishes one replay proof and returns its deterministic `replayId`.

```solidity
function publishReplay(
    address portfolio_owner,
    uint256 subject_id,
    address pool,
    uint64 from_block,
    uint64 to_block,
    uint32 swap_count,
    bytes32 input_root,
    bytes32 result_hash,
    bytes32 attestation_hash,
    bytes32 tee_image_hash
) external returns (bytes32);
```

Validation:

| Condition | Error |
| --- | --- |
| `portfolio_owner == address(0)` | `ZeroPortfolioOwner()` |
| `pool == address(0)` | `ZeroPool()` |
| `from_block > to_block` | `InvalidBlockRange(uint64,uint64)` |
| `swap_count == 0 || swap_count > 1000` | `InvalidSwapCount(uint32)` |
| `input_root == bytes32(0)` | `EmptyInputRoot()` |
| `result_hash == bytes32(0)` | `EmptyResultHash()` |
| `attestation_hash == bytes32(0)` | `EmptyAttestationHash()` |
| `replayId` already exists | `AlreadyPublished(bytes32)` |

#### `getReplay(bytes32 replay_id)`

Returns the stored replay proof metadata.

Return order:

```solidity
(
  address publisher,
  uint256 timestamp,
  address portfolioOwner,
  uint256 subjectId,
  address pool,
  uint256 fromBlock,
  uint256 toBlock,
  uint256 swapCount,
  bytes32 inputRoot,
  bytes32 resultHash,
  bytes32 attestationHash,
  bytes32 teeImageHash
)
```

#### `replayCount(uint256 subject_id)` and `replayAt(uint256 subject_id, uint256 index)`

List replay proofs associated with a portfolio subject.

#### `computeReplayId(...)`

Recomputes the deterministic replay ID off-chain clients should expect from `publishReplay`.

#### `computeFee(uint256 amount_in, uint32 fee_pips)`

Small deterministic spot-check helper for Uniswap-style fee pips where `1_000_000` equals 100%.

Example:

```bash
cast call --rpc-url "$ROBINHOOD_RPC" \
  0x75191d7ca10ea9c36b88b169896d4f258702afa2 \
  "computeFee(uint256,uint32)(uint256,uint256)" \
  1000000 \
  3000
```

Expected output:

```text
997000
3000
```

### Intended Integration Flow

1. Backend scans the last 1,000 swaps for a pool.
2. Backend canonicalizes swaps into a compressed batch and computes `inputRoot`.
3. Phala TEE runs the full replay and emits canonical replay output.
4. Backend computes `resultHash`, `attestationHash`, and `teeImageHash`.
5. Backend calls `publishReplay(...)`.
6. The final report references `replayId`, `inputRoot`, `resultHash`, and the publish transaction.
7. Frontend can label replay output as TEE-anchored when report fields match `getReplay(replayId)`.

## Security And Operational Notes

- The registry is append-only by root hash. There is no update or delete path.
- `rootHash` uniqueness prevents accidental overwrites.
- `publisher` is recorded, but publication is not permissioned in this version.
- If production requires only trusted publishers, add an owner/admin or allowlist before mainnet use.
- `PortfolioRiskEngine` is stateless and read-only. It does not depend on block timestamp, caller, or external contracts.
- The risk engine trusts the aggregate metrics passed into it. Data correctness must be enforced by the backend, indexer, or future attestation layer.
- `SwapReplayVerifier` trusts the off-chain compressed swap batch and TEE output hashes. It proves provenance, not raw event correctness.
- The current contracts are suitable for hackathon proof-of-integration and testnet demos. Production use should add access control, events, richer metadata, and an upgrade or migration strategy.

## Deployed Robinhood Testnet Addresses

| Contract | Address |
| --- | --- |
| `PortfolioReportRegistry` | `0x9803be5349eedf7c28ac1914b743757ce043b7cc` |
| `PortfolioRiskEngine` | `0x8d21329ac9d7785333cb41e187e556a8f7b81ec0` |
| `SwapReplayVerifier` | `0x75191d7ca10ea9c36b88b169896d4f258702afa2` |

See `deployments/robinhood-testnet.json` for deploy transactions, activation transactions, and smoke test outputs.
