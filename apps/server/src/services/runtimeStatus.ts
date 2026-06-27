import type { ServerConfig } from "../config.js";

export interface RuntimeStatus {
  agentRuntime: ServerConfig["agentRuntimeProvider"];
  strategistProvider: ServerConfig["strategistProvider"];
  elizaReady: boolean;
  phalaReady: boolean;
  mantleReady: boolean;
  turingAgentReady: boolean;
  beDataReady: boolean;
  merchantMoeReady: boolean;
  executionReady: boolean;
  teeAnchorReady: boolean;
  robinhoodReady: boolean;
  reportAnchoringReady: boolean;
  noMockDemoReady: boolean;
  modelProvider: {
    provider: "gemini";
    model: string;
    ready: boolean;
  };
  notes: string[];
}

export function getRuntimeStatus(config: ServerConfig): RuntimeStatus {
  const modelReady = Boolean(config.geminiApiKey);
  const elizaReady = modelReady;
  const robinhoodReady = Boolean(
    config.robinhoodRpcUrl &&
      config.robinhoodChainId &&
      config.robinhoodNfpmAddress &&
      config.lpGuardianRiskEngineContract,
  );
  const reportAnchoringReady = Boolean(
    config.robinhoodRpcUrl &&
      config.robinhoodChainId &&
      config.lpGuardianReportsContract,
  );
  const phalaReady = Boolean(
    config.phalaApiUrl ||
      (config.phalaAgentContract &&
        config.phalaAttestationVerifier &&
        config.robinhoodRpcUrl),
  );
  const mantleReady = Boolean(
    config.mantleRpcUrl &&
      config.mantleChainId &&
      config.turingRegistryAddress !== "0x0000000000000000000000000000000000000000",
  );
  const beDataReady = Boolean(config.beDataServiceUrl);
  const merchantMoeReady = Boolean(config.merchantMoeSubgraphUrl);
  const turingAgentReady = Boolean(config.turingAgentId);
  const executionReady = Boolean(config.permit2BundlerAddress);
  const teeAnchorReady = Boolean(config.teeAnchorAddress);
  const noMockDemoReady = robinhoodReady && phalaReady;

  return {
    agentRuntime: config.agentRuntimeProvider,
    strategistProvider: config.strategistProvider,
    elizaReady,
    phalaReady,
    mantleReady,
    turingAgentReady,
    beDataReady,
    merchantMoeReady,
    executionReady,
    teeAnchorReady,
    robinhoodReady,
    reportAnchoringReady,
    noMockDemoReady,
    modelProvider: {
      provider: "gemini",
      model: config.geminiModel,
      ready: modelReady,
    },
    notes: [
      elizaReady
        ? `ElizaOS runtime dependencies are installed and GEMINI_API_KEY is present for ${config.geminiModel}.`
        : `ElizaOS runtime dependencies are installed; set GEMINI_API_KEY before using model-backed actions with ${config.geminiModel}.`,
      robinhoodReady
        ? "Robinhood real-data config is present."
        : "Robinhood real-data config needs RPC, chain ID, NFPM address, and risk engine address.",
      reportAnchoringReady
        ? "Report registry config is present; backend auto-publish additionally needs WALLET_BACKEND_PK or an external signer path."
        : "Report anchoring needs report registry address.",
      phalaReady
        ? "Phala TDX/CVM config is present; strategist and verdict calls will use PHALA_API_URL when provided."
        : "Phala needs PHALA_API_URL for CVM calls, or agent contract + attestation verifier + RPC for contract-based verification.",
      mantleReady
        ? "Mantle Turing registry config is present."
        : "Mantle Turing registry needs MANTLE_RPC, MANTLE_CHAIN_ID, and MANTLE_TURING_REGISTRY.",
      turingAgentReady
        ? `Default Mantle Turing agent id is configured: ${config.turingAgentId?.toString()}.`
        : "Set LPGUARDIAN_TURING_AGENT_ID after registering the agent to enable automatic recordDecision writes.",
      beDataReady
        ? "BE Data service URL is configured; Strategist will attempt correlation, simulation, optimization, and TEE calls through that boundary."
        : "BE Data service URL is not configured; Strategist will use degraded local fallbacks.",
      merchantMoeReady
        ? "Merchant Moe subgraph URL is configured for Mantle Scout."
        : "Merchant Moe subgraph URL is not configured; Mantle Scout returns an explicit degraded empty scan.",
      executionReady
        ? "Permit2Bundler address is configured; transaction submission still requires the execution backend."
        : "Permit2Bundler address is not configured; Executor remains preview/disabled only.",
      teeAnchorReady
        ? "TEEAnchor address is configured."
        : "TEEAnchor address is not configured; TEE anchoring remains unavailable.",
    ],
  };
}
