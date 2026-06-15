import { z } from "zod";

const bigintStringSchema = z
  .string()
  .regex(/^\d+$/, "must be an unsigned integer string");

export const portfolioRiskInputSchema = z.object({
  totalPositions: bigintStringSchema,
  outOfRangePositions: bigintStringSchema,
  dustPositions: bigintStringSchema,
  correlatedExposureBps: bigintStringSchema,
  concentrationBps: bigintStringSchema,
});

export const portfolioRiskInputSourceSchema = z.object({
  name: z.string().min(1).default("Client supplied aggregate risk input"),
  label: z.enum(["VERIFIED", "COMPUTED", "EMULATED"]).default("EMULATED"),
  notes: z.array(z.string()).optional(),
});

export const portfolioDiagnoseSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "walletAddress must be an EVM address"),
  tokenId: bigintStringSchema.optional(),
  subjectId: bigintStringSchema.default("0"),
  riskInput: portfolioRiskInputSchema.optional(),
  riskInputSource: portfolioRiskInputSourceSchema.optional(),
  publishReport: z.boolean().default(false),
  requirePhala: z.boolean().default(false),
  requireTee: z.boolean().default(false),
  phalaAttestationHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "phalaAttestationHash must be bytes32")
    .optional(),
  teeAttestationHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "teeAttestationHash must be bytes32")
    .optional(),
});

export type PortfolioDiagnoseRequest = z.infer<typeof portfolioDiagnoseSchema>;
