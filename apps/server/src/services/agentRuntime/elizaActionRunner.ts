import {
  ChannelType,
  DEFAULT_UUID,
  type AgentRuntime as ElizaRuntime,
  type Content,
  type Memory,
  type State,
  type UUID,
} from "@elizaos/core";
import { randomUUID } from "node:crypto";
import { SUMMARIZE_LP_RISK_ACTION } from "../../agent/plugins/lpg-plugin/action.js";
import {
  strategistAdviceSchema,
  type FoundationRunRequest,
} from "../../schemas/agent.js";
import type { StrategistAdvice } from "./types.js";

export interface ElizaActionAdvice extends StrategistAdvice {
  source: {
    provider: "eliza";
    label: "EMULATED";
    modelProvider: "gemini" | "deterministic";
    modelName: string;
    modelBacked: boolean;
    actionName: string;
    actionText?: string;
    callbackText?: string;
  };
}

export async function runElizaSummarizeLpRiskAction(
  runtime: ElizaRuntime,
  input?: FoundationRunRequest,
): Promise<ElizaActionAdvice> {
  const action = runtime.actions.find(
    (candidate) => candidate.name === SUMMARIZE_LP_RISK_ACTION,
  );

  if (!action) {
    throw new Error(
      `ElizaOS action ${SUMMARIZE_LP_RISK_ACTION} is not registered.`,
    );
  }

  const message = createActionMessage(runtime, input);
  const state = createActionState(runtime);
  let callbackContent: Content | undefined;

  const result = await action.handler(
    runtime,
    message,
    state,
    {
      walletAddress: input?.walletAddress,
      scenario: input?.scenario,
    },
    async (response) => {
      callbackContent = response;
      return [];
    },
  );

  if (!result?.success) {
    throw new Error(
      result?.error instanceof Error
        ? result.error.message
        : String(result?.error ?? "ElizaOS action failed."),
    );
  }

  const advice = {
    recommendation: readRecommendation(result.values?.recommendation),
    rationale:
      result.text ??
      callbackContent?.text ??
      "ElizaOS LP Guardian action completed without rationale text.",
    confidence: readConfidence(result.values?.confidence),
    attestationLabel: readAttestationLabel(result.values?.attestationLabel),
    source: {
      provider: "eliza",
      label: "EMULATED",
      modelProvider: readModelProvider(result.values?.modelProvider),
      modelName: readModelName(runtime, result.values?.modelName),
      modelBacked: result.values?.modelBacked === true,
      actionName: action.name,
      actionText: result.text,
      callbackText: callbackContent?.text,
    },
  };

  return strategistAdviceSchema.parse(advice) as ElizaActionAdvice;
}

function createActionMessage(
  runtime: ElizaRuntime,
  input?: FoundationRunRequest,
): Memory {
  return {
    id: randomUUID() as UUID,
    agentId: runtime.agentId,
    roomId: DEFAULT_UUID,
    entityId: DEFAULT_UUID,
    createdAt: Date.now(),
    content: {
      text: `Summarize LP risk for ${input?.walletAddress ?? "unknown wallet"}`,
      actions: [SUMMARIZE_LP_RISK_ACTION],
      source: "lp-guardian-server",
      channelType: ChannelType.API,
      walletAddress: input?.walletAddress,
      scenario: input?.scenario ?? "basic",
    },
  };
}

function createActionState(runtime: ElizaRuntime): State {
  return {
    values: {
      agentName: runtime.character.name,
      actionNames: SUMMARIZE_LP_RISK_ACTION,
    },
    data: {
      source: "lp-guardian-server",
    },
    text: "",
  };
}

function readRecommendation(
  value: unknown,
): StrategistAdvice["recommendation"] {
  return value === "hold" ||
    value === "rebalance" ||
    value === "migrate" ||
    value === "monitor"
    ? value
    : "monitor";
}

function readConfidence(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0.7;
}

function readAttestationLabel(
  value: unknown,
): StrategistAdvice["attestationLabel"] {
  return value === "VERIFIED" ? "VERIFIED" : "EMULATED";
}

function readModelProvider(value: unknown): "gemini" | "deterministic" {
  return value === "gemini" ? "gemini" : "deterministic";
}

function readModelName(runtime: ElizaRuntime, value: unknown): string {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }

  const settings = runtime.character.settings as
    | { model?: unknown }
    | undefined;
  return typeof settings?.model === "string" && settings.model.length > 0
    ? settings.model
    : "gemini-1.5-flash";
}
