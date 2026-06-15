import { keccak256, toHex } from "viem";
import type { RegimeLabel } from "../math/regimeClassifier.js";

// Mirrors the frontend HooksPanel HookFamily union.
export type HookFamily =
  | "DYNAMIC_FEE_ADVANCED"
  | "SWAP_DELTA_CUT"
  | "MEMECOIN_ROYALTY"
  | "GATED_SWAP"
  | "INIT_GATE"
  | "CUSTOM_LIFECYCLE"
  | "UNKNOWN";

export interface HookCandidate {
  poolId: string;
  hookAddress: string;
  family: HookFamily;
  flagsBitmap: number;
  activeFlags: string[];
  feeTier: number;
  tickSpacing: number;
  tvlUsd: number;
  volumeUsd: number;
  pair: string;
}

export interface HookDiscoveryResult {
  candidates: HookCandidate[];
  topFamily: HookFamily;
  count: number;
}

// V4 hook permission bit → label (subset used for display).
const FLAG_BITS: { bit: number; flag: string }[] = [
  { bit: 1 << 6, flag: "beforeSwap" },
  { bit: 1 << 5, flag: "afterSwap" },
  { bit: 1 << 7, flag: "beforeAddLiquidity" },
  { bit: 1 << 11, flag: "beforeSwapReturnDelta" },
];

// Best-fit hook family for the detected regime.
const FAMILY_FOR_REGIME: Record<RegimeLabel, HookFamily> = {
  trending: "DYNAMIC_FEE_ADVANCED",
  mean_reverting: "DYNAMIC_FEE_ADVANCED",
  high_toxic: "SWAP_DELTA_CUT",
  jit_dominated: "GATED_SWAP",
};

const FAMILY_FLAGS: Record<HookFamily, number> = {
  DYNAMIC_FEE_ADVANCED: (1 << 6) | (1 << 5) | (1 << 11),
  SWAP_DELTA_CUT: (1 << 6) | (1 << 11),
  MEMECOIN_ROYALTY: (1 << 5),
  GATED_SWAP: (1 << 6) | (1 << 7),
  INIT_GATE: (1 << 7),
  CUSTOM_LIFECYCLE: (1 << 6) | (1 << 5) | (1 << 7),
  UNKNOWN: 0,
};

/**
 * Discovers candidate V4 hooks for a pool. Without a V4 subgraph key on
 * Arbitrum this is a deterministic heuristic keyed by pair + regime; results are
 * carried as EMULATED downstream. Replace with a real V4 subgraph/PoolManager
 * scan when THE_GRAPH_KEY is configured.
 */
export function discoverHooks(
  pair: string,
  poolId: string,
  regime: RegimeLabel,
): HookDiscoveryResult {
  const family = FAMILY_FOR_REGIME[regime];
  const flags = FAMILY_FLAGS[family];
  const seed = keccak256(toHex(`${pair}:${family}`));
  const hookAddress = `0x${seed.slice(26)}`; // last 20 bytes → address

  const activeFlags = FLAG_BITS.filter(({ bit }) => (flags & bit) !== 0).map(
    ({ flag }) => flag,
  );

  // Deterministic but plausible TVL/volume from the seed.
  const seedNum = Number(BigInt(seed) % 1000n);
  const tvlUsd = 2_000_000 + seedNum * 12_000;
  const volumeUsd = tvlUsd * (3 + (seedNum % 5));

  const candidate: HookCandidate = {
    poolId,
    hookAddress,
    family,
    flagsBitmap: flags,
    activeFlags,
    feeTier: 8_388_608, // dynamic-fee sentinel
    tickSpacing: 60,
    tvlUsd,
    volumeUsd,
    pair,
  };

  return { candidates: [candidate], topFamily: family, count: 1 };
}
