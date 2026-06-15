const Q96 = 2n ** 96n;

export interface TokenAmountPair {
  amount0: number;
  amount1: number;
}

export interface ConcentratedLiquidityInput {
  liquidity: bigint;
  tickLower: number;
  tickUpper: number;
  currentTick: number;
  token0Decimals: number;
  token1Decimals: number;
}

export interface ImpermanentLossInput {
  currentAmount0: number;
  currentAmount1: number;
  hodlAmount0: number;
  hodlAmount1: number;
  token0PriceUsd: number;
  token1PriceUsd: number;
}

export interface ImpermanentLossResult {
  currentLpValueUsd: number;
  hodlValueUsd: number;
  ilUsd: number;
  ilBps: number;
}

function tickToSqrtPrice(tick: number): number {
  return Math.pow(1.0001, tick / 2);
}

function scaleAmount(rawAmount: number, decimals: number): number {
  return rawAmount / 10 ** decimals;
}

export function sqrtPriceX96ToToken1PerToken0(
  sqrtPriceX96: bigint,
  token0Decimals: number,
  token1Decimals: number,
): number {
  const sqrtRatio = Number(sqrtPriceX96) / Number(Q96);
  const rawPrice = sqrtRatio * sqrtRatio;

  return rawPrice * 10 ** (token0Decimals - token1Decimals);
}

export function amountsFromConcentratedLiquidity(
  input: ConcentratedLiquidityInput,
): TokenAmountPair {
  const liquidity = Number(input.liquidity);
  const sqrtLower = tickToSqrtPrice(input.tickLower);
  const sqrtUpper = tickToSqrtPrice(input.tickUpper);
  const sqrtCurrent = tickToSqrtPrice(input.currentTick);

  if (sqrtCurrent <= sqrtLower) {
    return {
      amount0: scaleAmount(
        liquidity * ((sqrtUpper - sqrtLower) / (sqrtLower * sqrtUpper)),
        input.token0Decimals,
      ),
      amount1: 0,
    };
  }

  if (sqrtCurrent >= sqrtUpper) {
    return {
      amount0: 0,
      amount1: scaleAmount(
        liquidity * (sqrtUpper - sqrtLower),
        input.token1Decimals,
      ),
    };
  }

  return {
    amount0: scaleAmount(
      liquidity * ((sqrtUpper - sqrtCurrent) / (sqrtCurrent * sqrtUpper)),
      input.token0Decimals,
    ),
    amount1: scaleAmount(
      liquidity * (sqrtCurrent - sqrtLower),
      input.token1Decimals,
    ),
  };
}

export function calculateImpermanentLoss(
  input: ImpermanentLossInput,
): ImpermanentLossResult {
  const currentLpValueUsd =
    input.currentAmount0 * input.token0PriceUsd +
    input.currentAmount1 * input.token1PriceUsd;
  const hodlValueUsd =
    input.hodlAmount0 * input.token0PriceUsd +
    input.hodlAmount1 * input.token1PriceUsd;
  const ilUsd = currentLpValueUsd - hodlValueUsd;
  const ilBps =
    hodlValueUsd === 0 ? 0 : Math.round((ilUsd / hodlValueUsd) * 10000);

  return {
    currentLpValueUsd,
    hodlValueUsd,
    ilUsd,
    ilBps,
  };
}
