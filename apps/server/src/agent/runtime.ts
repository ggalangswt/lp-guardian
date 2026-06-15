import {
  AgentRuntime,
  InMemoryDatabaseAdapter,
  type IDatabaseAdapter,
} from "@elizaos/core";
import { guardianCharacter } from "./characters/guardian.js";
import { lpGuardianPlugin } from "./plugins/lpg-plugin/index.js";

export interface LpGuardianElizaRuntimeOptions {
  adapter?: IDatabaseAdapter;
  logLevel?: "trace" | "debug" | "info" | "warn" | "error" | "fatal";
}

export async function createLpGuardianElizaRuntime(
  options: LpGuardianElizaRuntimeOptions = {},
): Promise<AgentRuntime> {
  const runtime = new AgentRuntime({
    character: guardianCharacter,
    plugins: [lpGuardianPlugin],
    adapter: options.adapter ?? new InMemoryDatabaseAdapter(),
    logLevel: options.logLevel ?? "error",
    disableBasicCapabilities: false,
    actionPlanning: false,
    checkShouldRespond: false,
  });

  await runtime.initialize({
    allowNoDatabase: true,
  });

  return runtime;
}
