import type { RegimeLabel } from "../math/regimeClassifier.js";
import type { HookCandidate, HookFamily } from "./hookDiscovery.js";

export interface ScoringMultipliers {
  feeApr: number;
  volume: number;
  ilImpact: number; // <1 reduces IL
  retention: number;
  rationale: string;
}

export interface HookScoringResult {
  hookAddress: string;
  family: string;
  baselineAprPct: number;
  simulatedAprPct: number;
  deltaAprPct: number;
  baselineIlPct: number;
  simulatedIlPct: number;
  deltaIlPct: number;
  feeCapturePct: number;
  multipliers: ScoringMultipliers;
  hoursScored: number;
  warnings: string[];
}

// Heuristic multiplier table per (family × regime). Not an EVM-state replay —
// results are always flagged EMULATED.
const TABLE: Partial<
  Record<HookFamily, Partial<Record<RegimeLabel, ScoringMultipliers>>>
> = {
  DYNAMIC_FEE_ADVANCED: {
    trending: {
      feeApr: 1.18,
      volume: 0.96,
      ilImpact: 0.82,
      retention: 0.91,
      rationale:
        "Dynamic fees retain more capture during trends while softening IL drag.",
    },
    mean_reverting: {
      feeApr: 1.06,
      volume: 1.02,
      ilImpact: 0.95,
      retention: 0.97,
      rationale:
        "In mean-reverting flow dynamic fees add modest capture; IL is already low.",
    },
    high_toxic: {
      feeApr: 1.1,
      volume: 0.9,
      ilImpact: 0.88,
      retention: 0.85,
      rationale: "Fee bumps on toxic swaps recoup some adverse selection.",
    },
    jit_dominated: {
      feeApr: 1.04,
      volume: 0.94,
      ilImpact: 0.9,
      retention: 0.8,
      rationale: "Dynamic fees alone only partly blunt JIT extraction.",
    },
  },
  SWAP_DELTA_CUT: {
    high_toxic: {
      feeApr: 1.22,
      volume: 0.88,
      ilImpact: 0.78,
      retention: 0.9,
      rationale:
        "Delta-cut on swaps taxes toxic flow directly, lifting net capture.",
    },
    trending: {
      feeApr: 1.12,
      volume: 0.92,
      ilImpact: 0.85,
      retention: 0.88,
      rationale: "Delta-cut helps in trends but less than a dynamic-fee hook.",
    },
  },
  GATED_SWAP: {
    jit_dominated: {
      feeApr: 1.27,
      volume: 0.85,
      ilImpact: 0.8,
      retention: 0.93,
      rationale:
        "Gating blocks JIT sandwiches, preserving fees for resident LPs.",
    },
  },
};

const DEFAULT: ScoringMultipliers = {
  feeApr: 1.05,
  volume: 1.0,
  ilImpact: 0.95,
  retention: 0.9,
  rationale: "Generic hook uplift estimate (no specialized behavior matched).",
};

export interface HookScoreInputs {
  candidate: HookCandidate;
  regime: RegimeLabel;
  baselineAprPct: number;
  baselineIlPct: number;
  hoursScored: number;
}

export function scoreHook(i: HookScoreInputs): HookScoringResult {
  const family = i.candidate.family;
  const m = TABLE[family]?.[i.regime] ?? DEFAULT;

  const simulatedAprPct = i.baselineAprPct * m.feeApr;
  const simulatedIlPct = i.baselineIlPct * m.ilImpact;
  const feeCapturePct = round2(50 + m.retention * 25 + (m.feeApr - 1) * 40);

  return {
    hookAddress: i.candidate.hookAddress,
    family,
    baselineAprPct: round2(i.baselineAprPct),
    simulatedAprPct: round2(simulatedAprPct),
    deltaAprPct: round2(simulatedAprPct - i.baselineAprPct),
    baselineIlPct: round2(i.baselineIlPct),
    simulatedIlPct: round2(simulatedIlPct),
    deltaIlPct: round2(simulatedIlPct - i.baselineIlPct),
    feeCapturePct,
    multipliers: m,
    hoursScored: i.hoursScored,
    warnings: ["EMULATED: heuristic multipliers, not an EVM-state replay."],
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
