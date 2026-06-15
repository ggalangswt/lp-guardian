// Impermanent-loss reconstruction over a price window, using real spot prices
// now and at the start of the window. Values are in USD.

export interface ILInputs {
  amount0: number; // current token0 in the position (human units)
  amount1: number;
  price0Then: number; // USD price of token0 at window start
  price1Then: number;
  price0Now: number;
  price1Now: number;
  fees0: number; // uncollected fees, human units
  fees1: number;
}

export interface ILBreakdown {
  hodlValueT1: number;
  lpValueT1: number;
  feesValueT1: number;
  ilT1: number; // positive => LP underperformed HODL
  ilPct: number; // ilT1 / hodlValue
  netPnL: number; // feesValue - ilT1
}

/**
 * Closed-form 50/50 IL applied to the position's current USD value. `k` is the
 * relative price of token0 (in token1 terms) now vs. at the window start.
 */
export function computeIL(i: ILInputs): ILBreakdown {
  const lpValueT1 = i.amount0 * i.price0Now + i.amount1 * i.price1Now;
  const feesValueT1 = i.fees0 * i.price0Now + i.fees1 * i.price1Now;

  const ratioThen = safeRatio(i.price0Then, i.price1Then);
  const ratioNow = safeRatio(i.price0Now, i.price1Now);
  const k = ratioThen > 0 ? ratioNow / ratioThen : 1;

  // LP value = HODL value * (2√k / (1+k)). ilMult ∈ (-1, 0].
  const ilMult = k > 0 ? (2 * Math.sqrt(k)) / (1 + k) - 1 : 0;
  const hodlValueT1 = ilMult > -1 ? lpValueT1 / (1 + ilMult) : lpValueT1;
  const ilT1 = hodlValueT1 - lpValueT1;
  const ilPct = hodlValueT1 > 0 ? ilT1 / hodlValueT1 : 0;
  const netPnL = feesValueT1 - ilT1;

  return {
    hodlValueT1: round(hodlValueT1),
    lpValueT1: round(lpValueT1),
    feesValueT1: round(feesValueT1),
    ilT1: round(ilT1),
    ilPct: round4(ilPct),
    netPnL: round(netPnL),
  };
}

function safeRatio(a: number, b: number): number {
  return b > 0 ? a / b : 0;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
