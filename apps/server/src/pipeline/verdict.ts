import type { ServerConfig } from "../config.js";
import type { ILBreakdown } from "./math/il.js";
import type { RegimeClassification } from "./math/regimeClassifier.js";
import type { HookScoringResult } from "./hooks/hookScorer.js";
import { requestPhalaVerdict } from "./phalaVerdict.js";

export type Recommendation = "hold" | "rebalance" | "migrate" | "monitor";

export interface VerdictResult {
  markdown: string;
  recommendation: Recommendation;
  model: string;
  provider: string;
  /** true when the verdict is not TEE-attested (mock / fallback). */
  stub: boolean;
  label: "EMULATED" | "VERIFIED";
  /** Raw TDX attestation quote when produced inside a Phala/dstack TEE. */
  attestationQuote?: string;
}

const RECOMMENDATIONS: Recommendation[] = [
  "hold",
  "rebalance",
  "migrate",
  "monitor",
];

function asRecommendation(value: string): Recommendation | null {
  return (RECOMMENDATIONS as string[]).includes(value)
    ? (value as Recommendation)
    : null;
}

export interface VerdictInputs {
  pair: string;
  il: ILBreakdown;
  regime: RegimeClassification;
  hookScore: HookScoringResult;
}

/**
 * Synthesizes the final verdict from the analysis. Deterministic and labeled
 * EMULATED unless attested by the TEE: when PHALA_API_URL points at the dstack
 * CVM attestor, the verdict is computed inside the TEE and returned with a TDX
 * quote → labeled VERIFIED. Any failure falls back to the deterministic verdict.
 *
 * Gated on PHALA_API_URL (not strategistProvider) so it stays independent of the
 * agent-runtime strategist selection.
 */
export async function synthesizeVerdict(
  config: ServerConfig,
  i: VerdictInputs,
): Promise<VerdictResult> {
  const deterministic = buildDeterministicVerdict(i);

  if (config.phalaApiUrl) {
    try {
      const resp = await requestPhalaVerdict(config, i);
      if (resp && resp.attested && resp.quote) {
        return {
          markdown: resp.markdown || deterministic.markdown,
          recommendation:
            asRecommendation(resp.recommendation) ?? deterministic.recommendation,
          model: "lp-guardian-tee-strategist-v0",
          provider: "phala-dstack",
          stub: false,
          label: "VERIFIED",
          attestationQuote: resp.quote,
        };
      }
    } catch (err) {
      console.warn(
        `[verdict] Phala CVM request failed: ${String(err)}. Using deterministic verdict.`,
      );
    }
    console.warn(
      "[verdict] Phala CVM unavailable or unattested; using deterministic verdict.",
    );
  }

  return deterministic;
}

function buildDeterministicVerdict(i: VerdictInputs): VerdictResult {
  const ilPct = i.il.ilPct * 100;
  const feesBeatIl = i.il.feesValueT1 >= i.il.ilT1;
  const hookHelps = i.hookScore.deltaAprPct > 0.5 || i.hookScore.deltaIlPct < -0.2;
  const regime = i.regime.topLabel;

  let recommendation: Recommendation;
  let headline: string;

  if (i.il.lpValueT1 < 1) {
    recommendation = "monitor";
    headline = "Position is empty/out-of-range — monitor before redeploying.";
  } else if (!feesBeatIl && hookHelps && (regime === "trending" || regime === "high_toxic")) {
    recommendation = "migrate";
    headline = `IL is outrunning fees in a ${regime.replace("_", "-")} regime. A ${i.hookScore.family} hook recovers ~${i.hookScore.deltaAprPct.toFixed(1)}% APR — migrate.`;
  } else if (!feesBeatIl) {
    recommendation = "rebalance";
    headline = "Fees aren't keeping up with IL. Rebalance to a wider, fee-aware range.";
  } else {
    recommendation = "hold";
    headline = "Fees are covering IL. Hold and keep monitoring.";
  }

  const markdown = [
    `**${recommendation.toUpperCase()}** — ${headline}`,
    "",
    `- IL vs HODL: ${ilPct >= 0 ? "-" : "+"}${Math.abs(ilPct).toFixed(2)}%`,
    `- Fees captured: $${i.il.feesValueT1.toFixed(2)}`,
    `- Regime: ${regime.replace("_", "-")} (${Math.round(i.regime.confidence * 100)}%)`,
    `- Best hook: ${i.hookScore.family} (Δapr ${i.hookScore.deltaAprPct.toFixed(1)}%, Δil ${i.hookScore.deltaIlPct.toFixed(2)}%)`,
    "",
    "_Execute remains user-approved only._",
  ].join("\n");

  return {
    markdown,
    recommendation,
    model: "lp-guardian-strategist-v0",
    provider: "deterministic",
    stub: true,
    label: "EMULATED",
  };
}
