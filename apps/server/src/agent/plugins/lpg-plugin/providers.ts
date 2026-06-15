import type { Provider } from "@elizaos/core";

export const lpgRuntimeProvider: Provider = {
  name: "LPG_RUNTIME_CONTEXT",
  description:
    "Provides LP Guardian runtime context, provenance rules, and current no-mock integration status.",
  get: async () => {
    return {
      text:
        "LP Guardian prioritizes verified ownership, real price inputs, deterministic IL, contract-backed risk scoring, and Phala attestation. If a source is unavailable, label it explicitly instead of using mock data.",
      values: {
        app: "LP Guardian",
        defaultChain: "Robinhood Chain testnet",
        provenancePolicy: "fail closed for judged no-mock paths",
      },
    };
  },
};
