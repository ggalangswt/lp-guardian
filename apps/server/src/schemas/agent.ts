import { z } from "zod";

export const DEFAULT_FOUNDATION_WALLET =
  "0x0000000000000000000000000000000000000000";

export const foundationScenarioSchema = z.enum([
  "basic",
  "dust-and-correlation",
  "tee-unavailable",
]);

/**
 * Strict schema for strategist advice to ensure provenance and consistency.
 */
export const strategistAdviceSchema = z.object({
  recommendation: z.enum(["hold", "rebalance", "migrate", "monitor"]),
  rationale: z.string().min(5, "Rationale is too short"),
  confidence: z.number().min(0).max(1),
  attestationLabel: z.enum(["EMULATED", "VERIFIED"]),
  source: z.object({
    provider: z.enum(["mock", "eliza", "phala"]),
    label: z.enum(["EMULATED", "VERIFIED"]),
    modelProvider: z.enum(["gemini", "phala", "deterministic"]).optional(),
    modelName: z.string().optional(),
    modelBacked: z.boolean().optional(),
    actionName: z.string().optional(),
    actionText: z.string().optional(),
    callbackText: z.string().optional(),
  }),
});

export type StrategistAdvice = z.infer<typeof strategistAdviceSchema>;

export const foundationRunRequestSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "walletAddress must be an EVM address"),
  scenario: foundationScenarioSchema.default("basic"),
});

export type FoundationRunRequest = z.infer<typeof foundationRunRequestSchema>;

export const diagnoseQuerySchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "walletAddress must be an EVM address")
    .default(DEFAULT_FOUNDATION_WALLET),
  scenario: foundationScenarioSchema.default("dust-and-correlation"),
  protocol: z.enum(["uniswap-v3", "uniswap-v4", "camelot"]).optional(),
});

export type DiagnoseQuery = z.infer<typeof diagnoseQuerySchema>;
