import type { AgentMessage } from "@lp-guardian/core";
import type { AgentRuntime as ElizaRuntime } from "@elizaos/core";
import { createLpGuardianElizaRuntime } from "../../agent/runtime.js";
import type { FoundationRunRequest } from "../../schemas/agent.js";
import { runElizaFoundationAgents } from "../agentOrchestrator.js";
import {
  ElizaStrategistAdapter,
  FallbackStrategistAdapter,
  MockStrategistAdapter,
  PhalaStrategistAdapter,
} from "./strategists.js";
import type {
  AgentRuntime,
  AgentRuntimeResult,
  StrategistAdapter,
} from "./types.js";
import type { ServerConfig } from "../../config.js";

export class ElizaAgentRuntime implements AgentRuntime {
  readonly provider = "eliza" as const;
  private runtime: ElizaRuntime | null = null;
  private initializePromise: Promise<ElizaRuntime> | null = null;
  private readonly strategist: StrategistAdapter;

  constructor(config: ServerConfig) {
    const adapters: StrategistAdapter[] = [];

    // 1. Priority: Phala (if enabled in config)
    if (config.strategistProvider === "phala") {
      adapters.push(new PhalaStrategistAdapter(config));
    }

    // 2. Fallback: Eliza LLM-backed actions
    adapters.push(new ElizaStrategistAdapter(() => this.initialize()));

    // 3. Last Resort: Deterministic Mock
    adapters.push(new MockStrategistAdapter());

    this.strategist = new FallbackStrategistAdapter(adapters);
  }

  async initialize(): Promise<ElizaRuntime> {
    if (this.runtime) return this.runtime;

    this.initializePromise ??= createLpGuardianElizaRuntime();
    this.runtime = await this.initializePromise;

    return this.runtime;
  }

  async runFoundation(
    input?: FoundationRunRequest,
  ): Promise<AgentRuntimeResult> {
    const runtime = await this.initialize();
    const result = runElizaFoundationAgents();
    const advice = await this.strategist.advise(input);

    return {
      ...result,
      strategistAdvice: advice,
      messages: result.messages.map((message) => ({
        ...message,
        payload: mergePayload(message.payload, {
          input,
          runtime: {
            provider: this.provider,
            agentId: runtime.agentId,
            character: runtime.character.name,
            pluginCount: runtime.plugins.length,
          },
          strategist: {
            provider: this.strategist.provider,
            advice,
          },
        }),
      })),
    };
  }
}

function mergePayload(
  payload: AgentMessage["payload"],
  extra: Record<string, unknown>,
): Record<string, unknown> {
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    return {
      ...payload,
      ...extra,
    };
  }

  return extra;
}
