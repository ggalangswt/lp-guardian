import { keccak256, toBytes, type Hex } from "viem";
import type { SwapEvent } from "../indexer/swapEvents.js";

const FEE_DENOMINATOR = 1_000_000n;

/**
 * TypeScript mirror of the Stylus `compute_fee_inner` (SwapReplayVerifier).
 * Integer math, fee_pips capped at the denominator — so any single replayed swap
 * can be re-verified on-chain via `computeFee(amountIn, feePips)`.
 */
export function computeFeeOffchain(
  amountIn: bigint,
  feePips: number,
): { amountAfterFee: bigint; feeAmount: bigint } {
  const pips = BigInt(Math.min(1_000_000, Math.max(0, Math.trunc(feePips))));
  const feeAmount = (amountIn * pips) / FEE_DENOMINATOR;
  const after = amountIn > feeAmount ? amountIn - feeAmount : 0n;
  return { amountAfterFee: after, feeAmount };
}

export interface SwapReplayInput {
  pool: string;
  tickLower: number;
  tickUpper: number;
  /** This position's liquidity (same L units as the pool's active liquidity). */
  positionLiquidity: bigint;
  /** Static fee tier in pips (e.g. 3000 = 0.30%). */
  feePips: number;
  token0Decimals: number;
  token1Decimals: number;
  price0Usd: number;
  price1Usd: number;
  swaps: SwapEvent[];
  fromBlock: bigint;
  toBlock: bigint;
}

export interface SwapReplayResult {
  pool: string;
  swapCount: number;
  swapsInRange: number;
  swapsOutOfRange: number;
  feePips: number;
  fromBlock: string;
  toBlock: string;
  /** Counterfactual fees this position would have captured (raw base units). */
  feesToken0Raw: string;
  feesToken1Raw: string;
  feesToken0: number;
  feesToken1: number;
  feesUsd: number;
  grossVolumeUsd: number;
  /** keccak256 of the canonical swap inputs (anchored as input_root). */
  inputRoot: Hex;
  /** keccak256 of the canonical result summary (anchored as result_hash). */
  resultHash: Hex;
  label: "COMPUTED";
  warnings: string[];
}

/**
 * Replays a sequence of real swaps against a position's range and computes the
 * counterfactual fees it would have captured. Fees are attributed pro-rata by
 * `positionLiquidity / (activeLiquidity + positionLiquidity)` for swaps whose
 * post-swap tick falls inside the position range — i.e. "what if this position
 * had been live across the last N swaps". Deterministic: same swaps + same
 * position → identical inputRoot/resultHash.
 */
export function replaySwaps(input: SwapReplayInput): SwapReplayResult {
  const { swaps, tickLower, tickUpper, positionLiquidity, feePips } = input;

  let feesToken0 = 0n;
  let feesToken1 = 0n;
  let grossVol0 = 0n;
  let grossVol1 = 0n;
  let inRange = 0;
  let outOfRange = 0;

  for (const s of swaps) {
    const within = s.tick >= tickLower && s.tick < tickUpper;
    if (within) inRange++;
    else outOfRange++;

    // The input token is whichever amount is paid into the pool (positive).
    const amount0In = s.amount0 > 0n ? s.amount0 : 0n;
    const amount1In = s.amount1 > 0n ? s.amount1 : 0n;
    grossVol0 += amount0In;
    grossVol1 += amount1In;

    if (!within || positionLiquidity === 0n) continue;

    // Counterfactual share: injecting this position dilutes the active pool.
    const denom = s.liquidity + positionLiquidity;
    if (denom === 0n) continue;

    if (amount0In > 0n) {
      const { feeAmount } = computeFeeOffchain(amount0In, feePips);
      feesToken0 += (feeAmount * positionLiquidity) / denom;
    }
    if (amount1In > 0n) {
      const { feeAmount } = computeFeeOffchain(amount1In, feePips);
      feesToken1 += (feeAmount * positionLiquidity) / denom;
    }
  }

  const feesToken0Human = toHuman(feesToken0, input.token0Decimals);
  const feesToken1Human = toHuman(feesToken1, input.token1Decimals);
  const feesUsd = feesToken0Human * input.price0Usd + feesToken1Human * input.price1Usd;
  const grossVolumeUsd =
    toHuman(grossVol0, input.token0Decimals) * input.price0Usd +
    toHuman(grossVol1, input.token1Decimals) * input.price1Usd;

  const inputRoot = hashInputs(input);
  const resultHash = hashResult({
    swapCount: swaps.length,
    swapsInRange: inRange,
    swapsOutOfRange: outOfRange,
    feesToken0Raw: feesToken0.toString(),
    feesToken1Raw: feesToken1.toString(),
    feePips,
  });

  return {
    pool: input.pool,
    swapCount: swaps.length,
    swapsInRange: inRange,
    swapsOutOfRange: outOfRange,
    feePips,
    fromBlock: input.fromBlock.toString(),
    toBlock: input.toBlock.toString(),
    feesToken0Raw: feesToken0.toString(),
    feesToken1Raw: feesToken1.toString(),
    feesToken0: feesToken0Human,
    feesToken1: feesToken1Human,
    feesUsd,
    grossVolumeUsd,
    inputRoot,
    resultHash,
    label: "COMPUTED",
    warnings: [
      "COMPUTED: counterfactual fees, pro-rata by injected liquidity share.",
      ...(swaps.length === 0 ? ["No swaps found in the scanned window."] : []),
    ],
  };
}

/** Canonical keccak over the ordered swap inputs (block, logIndex, amounts, L, tick). */
function hashInputs(input: SwapReplayInput): Hex {
  const rows = input.swaps.map(
    (s) =>
      `${s.blockNumber}:${s.logIndex}:${s.amount0}:${s.amount1}:${s.liquidity}:${s.tick}`,
  );
  const canonical = JSON.stringify({
    pool: input.pool.toLowerCase(),
    tickLower: input.tickLower,
    tickUpper: input.tickUpper,
    positionLiquidity: input.positionLiquidity.toString(),
    feePips: input.feePips,
    swaps: rows,
  });
  return keccak256(toBytes(canonical));
}

function hashResult(summary: Record<string, string | number>): Hex {
  const canonical = JSON.stringify(summary, Object.keys(summary).sort());
  return keccak256(toBytes(canonical));
}

function toHuman(raw: bigint, decimals: number): number {
  if (raw === 0n) return 0;
  return Number(raw) / 10 ** decimals;
}
