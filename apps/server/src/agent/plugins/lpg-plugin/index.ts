import type { Plugin } from "@elizaos/core";
import { summarizeLpRiskAction } from "./action.js";
import { lpgRuntimeProvider } from "./providers.js";

export const lpGuardianPlugin: Plugin = {
  name: "lp-guardian",
  description:
    "LP Guardian domain tools for LP portfolio risk, provenance, and no-mock demo guardrails.",
  actions: [summarizeLpRiskAction],
  providers: [lpgRuntimeProvider],
};
