import type { HookCandidate } from "./hooks/hookDiscovery.js";
import type { V3PositionRaw } from "../indexer/types.js";

export interface MigrationStep {
  kind: "close" | "swap" | "mint";
  description: string;
  detail?: Record<string, string>;
}

export interface MigrationSwapQuote {
  routing: string;
  amountIn: string;
  amountOut: string;
  priceImpact: number;
  slippageTolerance: number;
  gasFeeUsd: string;
  routeKinds: string[];
}

export interface MigrationPreview {
  fromVersion: 3;
  targetHook?: { address: string; family: string; poolId: string };
  steps: MigrationStep[];
  swapQuote?: MigrationSwapQuote;
  warnings: string[];
}

export interface MigrationInputs {
  position: V3PositionRaw;
  hook: HookCandidate;
  regimeLabel: string;
  price0Now: number;
  price1Now: number;
}

/**
 * Builds a V3→V4 migration preview (close → rebalance swap → mint against hook).
 * The swap quote is an estimate (EMULATED) — execution is always user-gated.
 */
export function buildMigrationPreview(i: MigrationInputs): MigrationPreview {
  const { position, hook } = i;
  const sym0 = position.pool.token0.symbol;
  const sym1 = position.pool.token1.symbol;

  const amount0 = Number(position.depositedToken0);
  const amount1 = Number(position.depositedToken1);
  const value0 = amount0 * i.price0Now;
  const value1 = amount1 * i.price1Now;
  const total = value0 + value1;

  // Estimate the swap needed to reach a balanced ratio for a wider range.
  const targetEach = total / 2;
  const swapFromToken0 = value0 > targetEach;
  const swapValue = Math.abs(value0 - targetEach);
  const amountIn = swapFromToken0
    ? `${(swapValue / i.price0Now).toFixed(4)} ${sym0}`
    : `${(swapValue / i.price1Now).toFixed(2)} ${sym1}`;
  const amountOut = swapFromToken0
    ? `${(swapValue / i.price1Now).toFixed(2)} ${sym1}`
    : `${(swapValue / i.price0Now).toFixed(4)} ${sym0}`;

  const priceImpact = total > 0 ? Math.min(0.01, swapValue / total / 50) : 0;
  const gasFeeUsd = (4 + Math.random() * 6).toFixed(2);

  const steps: MigrationStep[] = [
    {
      kind: "close",
      description: `Close Uniswap v3 position #${position.id}`,
      detail: { reason: `range misaligned for ${i.regimeLabel} regime` },
    },
    {
      kind: "swap",
      description: `Rebalance ${sym0}/${sym1} ratio for a wider range`,
      detail: { routing: "universal-router" },
    },
    {
      kind: "mint",
      description: `Mint v4 position against ${hook.family} hook`,
      detail: { range: "wider", hook: hook.family },
    },
  ];

  return {
    fromVersion: 3,
    targetHook: { address: hook.hookAddress, family: hook.family, poolId: hook.poolId },
    steps,
    swapQuote: {
      routing: "universal-router",
      amountIn,
      amountOut,
      priceImpact: round4(priceImpact),
      slippageTolerance: 0.005,
      gasFeeUsd,
      routeKinds: ["v3-close", "swap", "v4-mint"],
    },
    warnings: ["Preview only. Execute remains gated by user approval."],
  };
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
