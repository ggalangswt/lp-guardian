import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

export type StorageProvider = "stub" | "ipfs";
export type ChainMode = "robinhood" | "mantle";

export interface ServerConfig {
  port: number;
  nodeEnv: string;
  corsOrigins: string[];
  agentRuntimeProvider: "mock" | "eliza";
  strategistProvider: "mock" | "eliza" | "phala";
  chainMode: ChainMode;

  // --- Chains ---
  arbitrumRpc: string;
  /** Alias of arbitrumRpc for scripts that reference arbitrumRpcUrl. */
  arbitrumRpcUrl?: string;
  arbitrumChainId: number;
  robinhoodRpc: string;
  /** Alias of robinhoodRpc kept for the robinhood/* services. */
  robinhoodRpcUrl?: string;
  robinhoodChainId: number;
  robinhoodNfpmAddress?: string;
  robinhoodV3FactoryAddress?: string;
  robinhoodScanFromBlock?: bigint;
  robinhoodScanChunkSize: bigint;
  robinhoodMaxScanRanges: bigint;
  /** Demo/canonical wallet that owns LP positions on Robinhood Chain (for MonitorService seed & smoke tests). */
  robinhoodCanonicalWalletAddress?: string;
  /** Token ID owned by robinhoodCanonicalWalletAddress on the Robinhood NFPM. */
  robinhoodCanonicalTokenId?: string;
  mantleRpc: string;
  mantleRpcUrl?: string;
  mantleChainId: number;

  /** Backend signer used to anchor reports on-chain (0x-prefixed, validated).
   *  Falls back to the deployer key when WALLET_BACKEND_PK is empty. */
  anchorSignerPk: `0x${string}` | null;
  /** Same signer as a plain string for the robinhood/* services. */
  walletBackendPrivateKey?: string;

  // --- Data sources ---
  beDataServiceUrl: string | null;
  beDataAuthToken: string | null;
  merchantMoeSubgraphUrl: string | null;
  theGraphKey: string | null;
  uniswapV3SubgraphId: string | null;
  uniswapV4SubgraphId: string | null;
  camelotSubgraphId: string | null;
  coinGeckoApiKey: string | null;

  // --- ElizaOS model provider ---
  geminiApiKey: string | null;
  geminiModel: string;

  // --- Deployed Stylus contracts (Robinhood Chain) ---
  reportRegistryAddress: `0x${string}`;
  riskEngineAddress: `0x${string}`;
  swapReplayVerifierAddress: `0x${string}`;
  turingRegistryAddress: `0x${string}`;
  turingAgentId?: bigint;
  permit2BundlerAddress?: `0x${string}`;
  teeAnchorAddress?: `0x${string}`;
  /** Same addresses under the names used by the robinhood/* services. */
  lpGuardianReportsContract?: string;
  lpGuardianRiskEngineContract?: string;

  // --- Phala TEE strategist ---
  phalaAgentContract?: string;
  phalaAttestationVerifier?: string;
  phalaApiUrl?: string;
  phalaApiKey?: string;

  // --- Report storage ---
  storageProvider: StorageProvider;
  ipfsToken: string | null;

  // --- Pipeline tuning ---
  dustThresholdUsd: number;
  /** How many Arbitrum blocks back to scan for the swap replay window. */
  swapReplayBlockWindow: number;
  /** Hard cap on replayed swaps (contract rejects >1000). */
  swapReplayMaxSwaps: number;
}

/** Walks up from `startDir` to the nearest .env and loads it into process.env
 *  (without overriding already-set vars). */
export function loadLocalEnv(startDir = process.cwd()): void {
  let current = resolve(startDir);
  let envPath: string | undefined;

  while (true) {
    const candidate = join(current, ".env");
    if (existsSync(candidate)) {
      envPath = candidate;
      break;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  if (!envPath) return;

  for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^"|"$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

function nonEmpty(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePk(value: string | undefined): `0x${string}` | null {
  const raw = nonEmpty(value);
  if (!raw) return null;
  const hex = raw.startsWith("0x") ? raw : `0x${raw}`;
  return /^0x[0-9a-fA-F]{64}$/.test(hex) ? (hex as `0x${string}`) : null;
}

function address(value: string | undefined, fallback: string): `0x${string}` {
  const raw = nonEmpty(value) ?? fallback;
  return raw as `0x${string}`;
}

function optionalAddress(value: string | undefined): `0x${string}` | undefined {
  const raw = nonEmpty(value);
  if (!raw) return undefined;
  return /^0x[0-9a-fA-F]{40}$/.test(raw) ? (raw as `0x${string}`) : undefined;
}

function optionalBigint(value: string | undefined): bigint | undefined {
  const raw = nonEmpty(value);
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  return BigInt(raw);
}

function strategistProvider(
  value: string | undefined,
): ServerConfig["strategistProvider"] {
  if (value === "eliza") return "eliza";
  if (value === "phala") return "phala";
  return "mock";
}

function chainMode(value: string | undefined): ChainMode {
  return value === "robinhood" ? "robinhood" : "mantle";
}

function list(value: string | undefined, fallback: string[]): string[] {
  const raw = nonEmpty(value);
  if (!raw) return fallback;
  const values = raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : fallback;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const robinhoodRpc =
    nonEmpty(env.ROBINHOOD_RPC) ?? "https://rpc.testnet.chain.robinhood.com";
  const robinhoodChainId = Number(env.ROBINHOOD_CHAIN_ID ?? 46630);
  const mantleRpc = nonEmpty(env.MANTLE_RPC) ?? "https://rpc.sepolia.mantle.xyz";
  const mantleChainId = Number(env.MANTLE_CHAIN_ID ?? 5003);
  const robinhoodScanFromBlock = env.ROBINHOOD_SCAN_FROM_BLOCK
    ? BigInt(env.ROBINHOOD_SCAN_FROM_BLOCK)
    : undefined;
  const robinhoodScanChunkSize = env.ROBINHOOD_SCAN_CHUNK_SIZE
    ? BigInt(env.ROBINHOOD_SCAN_CHUNK_SIZE)
    : 10n;
  const robinhoodMaxScanRanges = env.ROBINHOOD_MAX_SCAN_RANGES
    ? BigInt(env.ROBINHOOD_MAX_SCAN_RANGES)
    : 1_000n;

  const reportRegistry = address(
    env.PortfolioReportRegistry ?? env.LPGUARDIAN_REPORTS_CONTRACT,
    "0x9803be5349eedf7c28ac1914b743757ce043b7cc",
  );
  const riskEngine = address(
    env.PortfolioRiskEngine ?? env.LPGUARDIAN_RISK_ENGINE_CONTRACT,
    "0x8d21329ac9d7785333cb41e187e556a8f7b81ec0",
  );
  const swapReplayVerifier = address(
    env.SwapReplayVerifier ?? env.LPGUARDIAN_SWAP_REPLAY_CONTRACT,
    "0x75191d7ca10ea9c36b88b169896d4f258702afa2",
  );
  const turingRegistry = address(
    env.LPGUARDIAN_TURING_REGISTRY ?? env.MANTLE_TURING_REGISTRY,
    "0x0000000000000000000000000000000000000000",
  );
  // Prefer a dedicated backend key; fall back to the funded deployer key.
  const anchorSignerPk =
    normalizePk(env.BACKEND_SIGNER_PK) ??
    normalizePk(env.WALLET_BACKEND_PK) ??
    normalizePk(env.WALLET_DEPLOYER_PK);

  return {
    port: Number(env.PORT ?? 3100),
    nodeEnv: env.NODE_ENV ?? "development",
    corsOrigins: list(env.CORS_ORIGINS, [
      "https://lp-guardian-web.vercel.app",
      "http://localhost:3000",
      "http://localhost:3100",
      "http://localhost:5173",
    ]),
    agentRuntimeProvider: env.AGENT_RUNTIME === "eliza" ? "eliza" : "mock",
    strategistProvider: strategistProvider(env.STRATEGIST_PROVIDER),
    chainMode: chainMode(env.LPGUARDIAN_CHAIN_MODE),

    arbitrumRpc: nonEmpty(env.ARBITRUM_RPC) ?? "https://arb1.arbitrum.io/rpc",
    arbitrumRpcUrl:
      nonEmpty(env.ARBITRUM_RPC) ?? "https://arb1.arbitrum.io/rpc",
    arbitrumChainId: Number(env.ARBITRUM_CHAIN_ID ?? 42161),
    robinhoodRpc,
    robinhoodRpcUrl: robinhoodRpc,
    robinhoodChainId,
    robinhoodNfpmAddress: nonEmpty(env.ROBINHOOD_NFPM_ADDRESS) ?? undefined,
    robinhoodV3FactoryAddress:
      nonEmpty(env.ROBINHOOD_V3_FACTORY_ADDRESS) ?? undefined,
    robinhoodScanFromBlock,
    robinhoodScanChunkSize,
    robinhoodMaxScanRanges,
    robinhoodCanonicalWalletAddress:
      nonEmpty(env.ROBINHOOD_CANONICAL_WALLET_ADDRESS) ?? undefined,
    robinhoodCanonicalTokenId:
      nonEmpty(env.ROBINHOOD_CANONICAL_TOKEN_ID) ?? undefined,
    mantleRpc,
    mantleRpcUrl: mantleRpc,
    mantleChainId,

    anchorSignerPk,
    walletBackendPrivateKey: anchorSignerPk ?? undefined,

    beDataServiceUrl: nonEmpty(env.BE_DATA_SERVICE_URL),
    beDataAuthToken: nonEmpty(env.BE_DATA_AUTH_TOKEN),
    merchantMoeSubgraphUrl: nonEmpty(env.MERCHANT_MOE_SUBGRAPH_URL),
    theGraphKey: nonEmpty(env.THE_GRAPH_KEY),
    uniswapV3SubgraphId: nonEmpty(env.UNISWAP_V3_SUBGRAPH_ID),
    uniswapV4SubgraphId: nonEmpty(env.UNISWAP_V4_SUBGRAPH_ID),
    camelotSubgraphId: nonEmpty(env.CAMELOT_SUBGRAPH_ID),
    coinGeckoApiKey: nonEmpty(env.COINGECKO_API_KEY),
    geminiApiKey: nonEmpty(env.GEMINI_API_KEY),
    geminiModel: nonEmpty(env.GEMINI_MODEL) ?? "gemini-1.5-flash",

    reportRegistryAddress: reportRegistry,
    riskEngineAddress: riskEngine,
    swapReplayVerifierAddress: swapReplayVerifier,
    turingRegistryAddress: turingRegistry,
    turingAgentId: optionalBigint(env.LPGUARDIAN_TURING_AGENT_ID),
    permit2BundlerAddress: optionalAddress(env.LPGUARDIAN_PERMIT2_BUNDLER),
    teeAnchorAddress: optionalAddress(env.LPGUARDIAN_TEE_ANCHOR),
    lpGuardianReportsContract: reportRegistry,
    lpGuardianRiskEngineContract: riskEngine,

    phalaAgentContract: nonEmpty(env.PHALA_AGENT_CONTRACT) ?? undefined,
    phalaAttestationVerifier:
      nonEmpty(env.PHALA_ATTESTATION_VERIFIER) ?? undefined,
    phalaApiUrl: nonEmpty(env.PHALA_API_URL) ?? undefined,
    phalaApiKey: nonEmpty(env.PHALA_API_KEY) ?? undefined,

    storageProvider: env.STORAGE_PROVIDER === "ipfs" ? "ipfs" : "stub",
    ipfsToken: nonEmpty(env.IPFS_TOKEN),

    dustThresholdUsd: Number(env.DUST_THRESHOLD_USD ?? 100),
    swapReplayBlockWindow: Number(env.SWAP_REPLAY_BLOCK_WINDOW ?? 120_000),
    swapReplayMaxSwaps: Math.min(
      1000,
      Number(env.SWAP_REPLAY_MAX_SWAPS ?? 1000),
    ),
  };
}
