import type { ServerConfig } from "../config.js";
import type { ILBreakdown } from "./math/il.js";
import type { RegimeClassification } from "./math/regimeClassifier.js";
import type { HookScoringResult } from "./hooks/hookScorer.js";

export interface PhalaVerdictInputs {
  pair: string;
  il: ILBreakdown;
  regime: RegimeClassification;
  hookScore: HookScoringResult;
}

export interface PhalaVerdictResponse {
  recommendation: string;
  markdown: string;
  reportData: string;
  quote: string | null;
  attested: boolean;
}

/**
 * Calls the LP Guardian TEE attestor running in a Phala/dstack CVM. Returns the
 * TEE-attested verdict + TDX quote, or null when the CVM is unreachable / not
 * configured (caller falls back to the deterministic verdict).
 */
export async function requestPhalaVerdict(
  config: ServerConfig,
  inputs: PhalaVerdictInputs,
): Promise<PhalaVerdictResponse | null> {
  if (!config.phalaApiUrl) return null;

  const url = `${config.phalaApiUrl.replace(/\/+$/, "")}/verdict`;
  const body = {
    pair: inputs.pair,
    il: {
      ilPct: inputs.il.ilPct,
      ilT1: inputs.il.ilT1,
      lpValueT1: inputs.il.lpValueT1,
      feesValueT1: inputs.il.feesValueT1,
    },
    regime: {
      topLabel: inputs.regime.topLabel,
      confidence: inputs.regime.confidence,
    },
    hookScore: {
      family: inputs.hookScore.family,
      deltaAprPct: inputs.hookScore.deltaAprPct,
      deltaIlPct: inputs.hookScore.deltaIlPct,
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.phalaApiKey
          ? { Authorization: `Bearer ${config.phalaApiKey}` }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`phala attestor ${res.status}`);
    return (await res.json()) as PhalaVerdictResponse;
  } catch (err) {
    console.warn(`[phalaVerdict] CVM call failed: ${String(err)}`);
    return null;
  }
}
