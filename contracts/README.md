# LP Guardian Contracts

Rust/Arbitrum Stylus contracts for LP Guardian's Robinhood Chain contract track, plus Solidity contracts for the Mantle Turing Test track.

## Contracts

- `PortfolioReportRegistry`: append-only report anchor registry keyed by `rootHash`.
- `PortfolioRiskEngine`: deterministic portfolio risk scorer for aggregate LP metrics.
- `SwapReplayVerifier`: replay proof registry for 1,000-swap TEE simulations.
- `evm/src/LPGuardianTuringRegistry.sol`: Mantle Solidity registry for ERC-8004-compatible agent identity, agent decisions, and benchmark outcomes.

See `CONTRACTS.md` for the full developer-facing contract reference, function behavior, integration flow, and example `cast` calls.

The Solidity contracts in `../LP-Doctor/contracts` are reference material only. This folder is the canonical Stylus implementation for LP Guardian.

## Mantle Turing Registry

`contracts/evm` is a standalone Foundry package. It intentionally uses Solidity instead of Stylus because Mantle is EVM-compatible and the hackathon requirement is agent identity plus on-chain decision benchmarking, not WASM execution.

The registry implements:

- ERC-721-style agent identity compatible with the ERC-8004 draft direction.
- `register(agentURI, codeHash)` for agent registration.
- `recordDecision(...)` for AI decisions.
- `recordOutcome(...)` for benchmark outcomes and score aggregation.
- `getAgentStats(agentId)` for reputation-like benchmark state.

Test:

```bash
cd contracts/evm
forge test -vvv
```

Deploy to Mantle Sepolia:

```bash
cd contracts/evm
MANTLE_RPC=https://rpc.sepolia.mantle.xyz \
WALLET_DEPLOYER_PK=0x... \
bash script/deploy.sh
```

Mainnet values:

```env
MANTLE_RPC=https://rpc.mantle.xyz
MANTLE_CHAIN_ID=5000
```

## Robinhood Chain Testnet

Official network values used by this workspace:

```env
ROBINHOOD_RPC=https://robinhood-testnet.g.alchemy.com/v2/<YOUR_API_KEY>
ROBINHOOD_CHAIN_ID=46630
```

The local `.env` can use an Alchemy endpoint for reliability. If Alchemy is unavailable, try the public Robinhood Chain Testnet RPC:

```env
ROBINHOOD_RPC=https://rpc.testnet.chain.robinhood.com
```

## Toolchain

```bash
rustup target add wasm32-unknown-unknown
cargo install --force cargo-stylus
```

## Build And Test

```bash
cd code/lp-guardian/contracts

cd portfolio-report-registry
cargo test
cargo stylus check
cargo run --features export-abi > abi/PortfolioReportRegistry.sol

cd ../portfolio-risk-engine
cargo test
cargo stylus check
cargo run --features export-abi > abi/PortfolioRiskEngine.sol

cd ../swap-replay-verifier
cargo test
cargo stylus check
cargo run --features export-abi > abi/SwapReplayVerifier.sol
```

## Robinhood Testnet Deployment

Deployed and activated on Robinhood Chain Testnet (`chainId=46630`) from deployer `0x351675d772326d4700ff289bf15F45d5CBE5aa3c`.

| Contract | Address | Deploy Tx | Activate Tx |
| --- | --- | --- | --- |
| `PortfolioReportRegistry` | `0x9803be5349eedf7c28ac1914b743757ce043b7cc` | `0x8fbe693fdaeb207a037160ac273723db8b66b5d910c026eabbaf2f24c6f30c26` | `0x2746aade816ec769f0cb77c8d28608d899e1a66aeeb8a8003639d9dead9ceafd` |
| `PortfolioRiskEngine` | `0x8d21329ac9d7785333cb41e187e556a8f7b81ec0` | `0xfcd841f8fb141a8cafd97120636edc5963e4a80185645fb3ba564446eb3ed122` | `0xbf779421e1db53ab426b7e8e69f659149ef1b0c5ea8d42fd61ff657318bc5a86` |
| `SwapReplayVerifier` | `0x75191d7ca10ea9c36b88b169896d4f258702afa2` | `0x0c24b2c9b3d5400ee41e1cf2604e549a1f75aecd4ccf932ea68c981aec34f59b` | `0x38e0a0f6c8cd7d3aabb5abda353fc72310e089506fafb1c5a1ce8cca9c216010` |

The same deployment data is stored in `deployments/robinhood-testnet.json`.

## Deploy

```bash
cd code/lp-guardian
source .env

cd contracts/portfolio-report-registry
cargo stylus deploy --no-verify --no-activate \
  --endpoint "$ROBINHOOD_RPC" \
  --private-key "$WALLET_DEPLOYER_PK"
cargo stylus activate --address <REPORT_REGISTRY_ADDRESS> \
  --endpoint "$ROBINHOOD_RPC" \
  --private-key "$WALLET_DEPLOYER_PK"

cd ../portfolio-risk-engine
cargo stylus deploy --no-verify --no-activate \
  --endpoint "$ROBINHOOD_RPC" \
  --private-key "$WALLET_DEPLOYER_PK"
cargo stylus activate --address <RISK_ENGINE_ADDRESS> \
  --endpoint "$ROBINHOOD_RPC" \
  --private-key "$WALLET_DEPLOYER_PK"

cd ../swap-replay-verifier
cargo stylus deploy --no-verify --no-activate \
  --endpoint "$ROBINHOOD_RPC" \
  --private-key "$WALLET_DEPLOYER_PK"
cargo stylus activate --address <SWAP_REPLAY_VERIFIER_ADDRESS> \
  --endpoint "$ROBINHOOD_RPC" \
  --private-key "$WALLET_DEPLOYER_PK"
```

## Smoke Test

```bash
cd code/lp-guardian
source .env

cast call --rpc-url "$ROBINHOOD_RPC" \
  0x9803be5349eedf7c28ac1914b743757ce043b7cc \
  "reportCount(uint256)(uint256)" 605311

cast call --rpc-url "$ROBINHOOD_RPC" \
  0x8d21329ac9d7785333cb41e187e556a8f7b81ec0 \
  "computeRisk(uint256,uint256,uint256,uint256,uint256)(uint256,uint8,uint8)" \
  10 9 3 6000 7000

cast call --rpc-url "$ROBINHOOD_RPC" \
  0x75191d7ca10ea9c36b88b169896d4f258702afa2 \
  "computeFee(uint256,uint32)(uint256,uint256)" \
  1000000 3000
```

## Notes

- `PortfolioReportRegistry` stores `attestationHash` instead of dynamic attestation bytes to keep storage and ABI simple.
- `PortfolioRiskEngine` is stateless and uses aggregate metrics. Backend services should compute raw portfolio metrics off-chain, then call the engine for deterministic scoring.
- `SwapReplayVerifier` anchors Phala TEE replay outputs. The heavy 1,000-swap replay remains off-chain; the contract stores replay provenance and exposes small deterministic spot-check helpers.
