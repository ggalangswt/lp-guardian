import type { ServerConfig } from "../../config.js";
import { ElizaAgentRuntime } from "./elizaRuntime.js";
import { MockAgentRuntime } from "./mockRuntime.js";
import {
  FallbackStrategistAdapter,
  MockStrategistAdapter,
  PhalaStrategistAdapter,
} from "./strategists.js";
import type {
  AgentRuntime,
  AgentRuntimeProvider,
  StrategistAdapter,
} from "./types.js";

function createStrategist(config: ServerConfig): StrategistAdapter {
  const adapters: StrategistAdapter[] = [];

  if (config.strategistProvider === "phala") {
    adapters.push(new PhalaStrategistAdapter(config));
  }

  adapters.push(new MockStrategistAdapter());

  return new FallbackStrategistAdapter(adapters);
}

export function createAgentRuntime(config: ServerConfig): AgentRuntime {
  if (config.agentRuntimeProvider === "eliza") {
    return new ElizaAgentRuntime(config);
  }

  const strategist = createStrategist(config);
  return new MockAgentRuntime(strategist);
}

export type {
  AgentRuntime,
  AgentRuntimeProvider,
  StrategistAdvice,
} from "./types.js";
