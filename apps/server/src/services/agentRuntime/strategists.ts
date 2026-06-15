import type { AgentRuntime as ElizaRuntime } from "@elizaos/core";
import type { ServerConfig } from "../../config.js";
import {
  strategistAdviceSchema,
  type FoundationRunRequest,
} from "../../schemas/agent.js";
import { runElizaSummarizeLpRiskAction } from "./elizaActionRunner.js";
import type { StrategistAdapter, StrategistAdvice } from "./types.js";

export class MockStrategistAdapter implements StrategistAdapter {
  readonly provider = "mock" as const;

  async advise(input?: FoundationRunRequest): Promise<StrategistAdvice> {
    const scenario = input?.scenario ?? "basic";

    const advice = {
      recommendation:
        scenario === "dust-and-correlation" ? "migrate" : "monitor",
      rationale:
        scenario === "tee-unavailable"
          ? "TEE strategist unavailable; using deterministic fallback advice."
          : scenario === "dust-and-correlation"
            ? "Dust and correlation risks are present; migration preview is the safest next step."
            : "Mock strategist recommends monitoring unless dust and correlation risks are present.",
      confidence: scenario === "basic" ? 0.62 : 0.74,
      attestationLabel: "EMULATED",
      source: {
        provider: "mock",
        label: "EMULATED",
        modelProvider: "deterministic",
        modelName: "mock-deterministic-strategist",
        modelBacked: false,
      },
    };

    return strategistAdviceSchema.parse(advice);
  }
}

export class ElizaStrategistAdapter implements StrategistAdapter {
  readonly provider = "eliza" as const;

  constructor(private readonly getRuntime: () => Promise<ElizaRuntime>) {}

  async advise(input?: FoundationRunRequest): Promise<StrategistAdvice> {
    return runElizaSummarizeLpRiskAction(await this.getRuntime(), input);
  }
}

export class PhalaStrategistAdapter implements StrategistAdapter {
  readonly provider = "phala" as const;

  constructor(private readonly config: ServerConfig) {}

  async advise(): Promise<StrategistAdvice> {
    if (
      !this.config.phalaAgentContract ||
      !this.config.phalaAttestationVerifier
    ) {
      throw new Error(
        "Real Phala requires PHALA_AGENT_CONTRACT and PHALA_ATTESTATION_VERIFIER.",
      );
    }
    if (!this.config.phalaApiUrl && !this.config.robinhoodRpcUrl) {
      throw new Error(
        "Real Phala requires PHALA_API_URL or Robinhood RPC access for contract calls.",
      );
    }

    throw new Error(
      "PhalaStrategistAdapter is configured but not wired to the provider call yet. Add the Phala request/verification contract once the SC and Phala interfaces are finalized.",
    );
  }
}

/**
 * Orchestrates multilevel fallback: tries each adapter in sequence until one succeeds.
 */
export class FallbackStrategistAdapter implements StrategistAdapter {
  constructor(private readonly adapters: StrategistAdapter[]) {}

  /** returns the provider of the first adapter (the primary one) */
  get provider() {
    return this.adapters[0]?.provider ?? ("mock" as const);
  }

  async advise(input?: FoundationRunRequest): Promise<StrategistAdvice> {
    let lastError: Error | undefined;

    for (const adapter of this.adapters) {
      try {
        const advice = await adapter.advise(input);
        return advice;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        console.warn(
          `[strategist-fallback] ${adapter.provider} failed, trying next... Reason: ${lastError.message}`,
        );
      }
    }

    throw (
      lastError ?? new Error("No strategist adapters succeeded in fallback chain.")
    );
  }
}
