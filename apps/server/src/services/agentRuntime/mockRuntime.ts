import type { AgentMessage } from "@lp-guardian/core";
import type { FoundationRunRequest } from "../../schemas/agent.js";
import { runMockFoundationAgents } from "../agentOrchestrator.js";
import type { AgentRuntime, AgentRuntimeResult, StrategistAdapter } from "./types.js";

export class MockAgentRuntime implements AgentRuntime {
  readonly provider = "mock" as const;

  constructor(private readonly strategist: StrategistAdapter) {}

  async runFoundation(
    input?: FoundationRunRequest,
  ): Promise<AgentRuntimeResult> {
    const result = runMockFoundationAgents();
    const advice = await this.strategist.advise(input);

    return {
      ...result,
      strategistAdvice: advice,
      messages: result.messages.map((message) => ({
        ...message,
        payload: mergePayload(message.payload, {
          input,
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
