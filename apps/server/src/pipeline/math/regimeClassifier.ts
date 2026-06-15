import type { RegimeFeatures } from "./regimeFeatures.js";

export type RegimeLabel =
  | "mean_reverting"
  | "trending"
  | "high_toxic"
  | "jit_dominated";

export interface RegimeScores {
  mean_reverting: number;
  trending: number;
  high_toxic: number;
  jit_dominated: number;
}

export interface RegimeClassification {
  topLabel: RegimeLabel;
  confidence: number;
  scores: RegimeScores;
  features: RegimeFeatures;
}

/**
 * Rule-based soft classifier. Each regime gets a raw affinity score from the
 * features, then scores are normalized to sum to 1 (soft confidence).
 */
export function classifyRegime(features: RegimeFeatures): RegimeClassification {
  const { hurst, rSquared, slope, volRealized, toxicityProxy, jitProxy } =
    features;

  // Trending: persistent (high Hurst) + a clean directional fit.
  const trending =
    clamp01((hurst - 0.5) * 2) * 0.6 + clamp01(rSquared) * 0.3 + clamp01(Math.abs(slope) * 200) * 0.1;

  // Mean-reverting: anti-persistent (low Hurst), moderate vol.
  const meanReverting =
    clamp01((0.5 - hurst) * 2) * 0.7 + clamp01(1 - rSquared) * 0.3;

  // High-toxic: frequent >2σ moves and elevated vol.
  const highToxic = clamp01(toxicityProxy * 4) * 0.7 + clamp01(volRealized) * 0.3;

  // JIT-dominated: erratic spike dispersion without sustained toxicity.
  const jitDominated =
    clamp01(jitProxy) * 0.7 + clamp01(0.2 - toxicityProxy) * 0.3 * (jitProxy > 0.4 ? 1 : 0.3);

  const raw: RegimeScores = {
    mean_reverting: meanReverting,
    trending,
    high_toxic: highToxic,
    jit_dominated: jitDominated,
  };

  const total =
    raw.mean_reverting + raw.trending + raw.high_toxic + raw.jit_dominated;
  const scores: RegimeScores =
    total > 0
      ? {
          mean_reverting: round4(raw.mean_reverting / total),
          trending: round4(raw.trending / total),
          high_toxic: round4(raw.high_toxic / total),
          jit_dominated: round4(raw.jit_dominated / total),
        }
      : { mean_reverting: 0.25, trending: 0.25, high_toxic: 0.25, jit_dominated: 0.25 };

  const topLabel = (Object.keys(scores) as RegimeLabel[]).reduce((a, b) =>
    scores[a] >= scores[b] ? a : b,
  );

  return {
    topLabel,
    confidence: scores[topLabel],
    scores,
    features,
  };
}

const REGIME_ADVICE: Record<RegimeLabel, string> = {
  trending: "Narrow LP ranges are paying rent to volatility — widen or migrate.",
  mean_reverting: "Tight ranges earn here; the price keeps coming back.",
  high_toxic: "Toxic flow is eating your edge — a fee-aware hook helps.",
  jit_dominated: "JIT bots are front-running fees — protected hooks matter.",
};

export function regimeNarrative(c: RegimeClassification): string {
  const label = c.topLabel.replace("_", "-");
  return `Market regime is ${label} (${Math.round(c.confidence * 100)}% confidence). ${REGIME_ADVICE[c.topLabel]}`;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
