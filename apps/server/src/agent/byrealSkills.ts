export interface ByrealSkillDefinition {
  name: "scout" | "strategist" | "executor" | "sentinel";
  description: string;
  parameters: Record<string, string>;
  endpoint: {
    method: "GET" | "POST";
    path: string;
  };
}

export interface ByrealSkillManifest {
  namespace: "lpguardian";
  version: "1.0.0";
  transport: "http";
  skills: ByrealSkillDefinition[];
}

export const lpGuardianByrealSkills: ByrealSkillManifest = {
  namespace: "lpguardian",
  version: "1.0.0",
  transport: "http",
  skills: [
    {
      name: "scout",
      description: "Scan wallet LP positions and produce portfolio risk inputs.",
      parameters: {
        walletAddress: "EVM wallet address",
        protocols: "Optional protocol list; Merchant Moe is the Mantle-first target.",
      },
      endpoint: {
        method: "GET",
        path: "/api/portfolio/:walletAddress/positions",
      },
    },
    {
      name: "strategist",
      description:
        "Run correlation, simulation, optimization, and optional Mantle Turing decision recording.",
      parameters: {
        walletAddress: "EVM wallet address",
        scenario: "Optional scenario label",
        recordTuringDecision: "Set true to record a Mantle Turing decision when configured.",
      },
      endpoint: {
        method: "POST",
        path: "/agent/orchestration/runs",
      },
    },
    {
      name: "executor",
      description:
        "Validate an approval-gated rebalance proposal and return execution preview or disabled status.",
      parameters: {
        walletAddress: "EVM wallet address",
        proposalHash: "bytes32 proposal hash",
        permit2Signature: "Optional Permit2 signature",
      },
      endpoint: {
        method: "POST",
        path: "/api/portfolio/execute",
      },
    },
    {
      name: "sentinel",
      description: "Watch wallet monitor state and return active alerts.",
      parameters: {
        walletAddress: "EVM wallet address",
        recordTuringOutcome: "Set true to record a simulated Mantle Turing outcome.",
        turingDecisionId: "Decision id returned by or derived from Mantle Turing Registry.",
      },
      endpoint: {
        method: "GET",
        path: "/agent/monitor/:walletAddress",
      },
    },
  ],
};
