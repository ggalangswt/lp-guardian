import type { AgentMessage, AgentRun } from "@lp-guardian/core";
import type { FoundationRunRequest, StrategistAdvice } from "../../schemas/agent.js";

export type AgentRuntimeProvider = "mock" | "eliza";

export interface AgentRuntimeResult {
  run: AgentRun;
  messages: AgentMessage[];
  strategistAdvice?: StrategistAdvice;
}

export interface AgentRuntime {
  readonly provider: AgentRuntimeProvider;
  runFoundation(input?: FoundationRunRequest): Promise<AgentRuntimeResult>;
}

export { type StrategistAdvice };

export interface StrategistAdapter {
  readonly provider: "mock" | "eliza" | "phala";
  advise(input?: FoundationRunRequest): Promise<StrategistAdvice>;
}
