import { keccak256, stringToHex, type Hex } from "viem";
import type { PortfolioRiskInput, PortfolioRiskResult } from "../robinhood/riskEngine.js";
import type { OwnershipValidationResult } from "../ownership.js";

export interface PortfolioReportSource {
  name: string;
  label: "VERIFIED" | "COMPUTED" | "UNAVAILABLE" | "EMULATED";
  chainId?: number;
  blockNumber?: bigint;
  contractAddress?: string;
  notes?: string[];
}

export interface PortfolioReportPayload {
  schemaVersion: "lp-guardian.report.v1";
  generatedAt: string;
  walletAddress: string;
  subjectId: string;
  chainId: number;
  ownership?: OwnershipValidationResult;
  riskInput: PortfolioRiskInput;
  riskOutput: PortfolioRiskResult;
  sources: PortfolioReportSource[];
  phala?: {
    status: "VERIFIED";
    attestationHash: Hex;
    verifier?: string;
    agentContract?: string;
  };
}

export interface HashedPortfolioReport {
  payload: PortfolioReportPayload;
  canonicalJson: string;
  rootHash: Hex;
}

function normalizeForJson(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeForJson);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => [key, normalizeForJson(entry)]),
  );
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(normalizeForJson(value));
}

export function hashPayload(value: unknown): Hex {
  return keccak256(stringToHex(canonicalJson(value)));
}

export function buildPortfolioReport(
  payload: PortfolioReportPayload,
): HashedPortfolioReport {
  const canonical = canonicalJson(payload);

  return {
    payload,
    canonicalJson: canonical,
    rootHash: keccak256(stringToHex(canonical)),
  };
}
