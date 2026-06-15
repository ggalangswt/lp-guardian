// Concentrated-liquidity math for reconstructing position state from raw
// on-chain reads (no subgraph). All "raw" amounts are in token smallest units.

const Q128 = 1n << 128n;
const MAX256 = (1n << 256n) - 1n;

/** sqrt(1.0001^tick) as a float. Precise enough for display-grade amounts. */
function sqrtRatioAtTick(tick: number): number {
  return Math.pow(1.0001, tick / 2);
}

export interface TokenAmounts {
  amount0Raw: number;
  amount1Raw: number;
}

/** Current token composition of a position given liquidity, the pool's current
 *  tick, and the position range. Mirrors Uniswap v3 LiquidityAmounts. */
export function amountsForLiquidity(
  liquidity: bigint,
  tickCurrent: number,
  tickLower: number,
  tickUpper: number,
): TokenAmounts {
  const L = Number(liquidity);
  if (L === 0) return { amount0Raw: 0, amount1Raw: 0 };

  const sqrtCur = sqrtRatioAtTick(tickCurrent);
  const sqrtA = sqrtRatioAtTick(tickLower);
  const sqrtB = sqrtRatioAtTick(tickUpper);

  let amount0 = 0;
  let amount1 = 0;

  if (sqrtCur <= sqrtA) {
    // Entirely below range → all token0.
    amount0 = L * (1 / sqrtA - 1 / sqrtB);
  } else if (sqrtCur >= sqrtB) {
    // Entirely above range → all token1.
    amount1 = L * (sqrtB - sqrtA);
  } else {
    amount0 = L * (1 / sqrtCur - 1 / sqrtB);
    amount1 = L * (sqrtCur - sqrtA);
  }

  return {
    amount0Raw: Math.max(0, amount0),
    amount1Raw: Math.max(0, amount1),
  };
}

function subIn256(a: bigint, b: bigint): bigint {
  return (a - b) & MAX256;
}

export interface FeeGrowthInputs {
  feeGrowthGlobal0X128: bigint;
  feeGrowthGlobal1X128: bigint;
  lowerFeeGrowthOutside0X128: bigint;
  lowerFeeGrowthOutside1X128: bigint;
  upperFeeGrowthOutside0X128: bigint;
  upperFeeGrowthOutside1X128: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
  liquidity: bigint;
  tickCurrent: number;
  tickLower: number;
  tickUpper: number;
}

/** Uncollected fees owed to a position, in raw token units. Replicates the
 *  Uniswap v3 fee-growth accounting (handles the mod-2^256 wraparound). */
export function uncollectedFees(i: FeeGrowthInputs): {
  fees0Raw: bigint;
  fees1Raw: bigint;
} {
  const below0 =
    i.tickCurrent >= i.tickLower
      ? i.lowerFeeGrowthOutside0X128
      : subIn256(i.feeGrowthGlobal0X128, i.lowerFeeGrowthOutside0X128);
  const below1 =
    i.tickCurrent >= i.tickLower
      ? i.lowerFeeGrowthOutside1X128
      : subIn256(i.feeGrowthGlobal1X128, i.lowerFeeGrowthOutside1X128);

  const above0 =
    i.tickCurrent < i.tickUpper
      ? i.upperFeeGrowthOutside0X128
      : subIn256(i.feeGrowthGlobal0X128, i.upperFeeGrowthOutside0X128);
  const above1 =
    i.tickCurrent < i.tickUpper
      ? i.upperFeeGrowthOutside1X128
      : subIn256(i.feeGrowthGlobal1X128, i.upperFeeGrowthOutside1X128);

  const inside0 = subIn256(subIn256(i.feeGrowthGlobal0X128, below0), above0);
  const inside1 = subIn256(subIn256(i.feeGrowthGlobal1X128, below1), above1);

  const delta0 = subIn256(inside0, i.feeGrowthInside0LastX128);
  const delta1 = subIn256(inside1, i.feeGrowthInside1LastX128);

  const fees0Raw = (delta0 * i.liquidity) / Q128 + i.tokensOwed0;
  const fees1Raw = (delta1 * i.liquidity) / Q128 + i.tokensOwed1;

  return { fees0Raw, fees1Raw };
}

/** Human-readable amount from a raw integer-unit amount. */
export function toHuman(raw: number | bigint, decimals: number): number {
  return Number(raw) / 10 ** decimals;
}
