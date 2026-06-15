// Statistical features for market-regime classification, computed from an
// hourly price series.

export interface RegimeFeatures {
  volRealized: number; // annualized realized volatility
  hurst: number; // R/S Hurst exponent (>0.55 trending, <0.45 mean-reverting)
  slope: number; // OLS slope of log-price vs hour index
  rSquared: number;
  toxicityProxy: number; // fraction of |return| > 2σ
  jitProxy: number; // dispersion of |returns| (erratic spikes)
  hoursAnalyzed: number;
}

const HOURS_PER_YEAR = 24 * 365;

export function computeRegimeFeatures(prices: number[]): RegimeFeatures {
  const clean = prices.filter((p) => Number.isFinite(p) && p > 0);
  const n = clean.length;
  if (n < 4) {
    return {
      volRealized: 0,
      hurst: 0.5,
      slope: 0,
      rSquared: 0,
      toxicityProxy: 0,
      jitProxy: 0,
      hoursAnalyzed: Math.max(0, n - 1),
    };
  }

  const returns: number[] = [];
  for (let i = 1; i < n; i++) returns.push(Math.log(clean[i]! / clean[i - 1]!));

  const meanR = mean(returns);
  const stdR = std(returns, meanR);

  const volRealized = stdR * Math.sqrt(HOURS_PER_YEAR);
  const hurst = hurstRS(returns, meanR, stdR);
  const { slope, rSquared } = logPriceTrend(clean);

  const toxicityProxy =
    stdR > 0
      ? returns.filter((r) => Math.abs(r) > 2 * stdR).length / returns.length
      : 0;

  const absReturns = returns.map((r) => Math.abs(r));
  const meanAbs = mean(absReturns);
  const jitProxy = meanAbs > 0 ? Math.min(1, std(absReturns, meanAbs) / meanAbs) : 0;

  return {
    volRealized: round4(volRealized),
    hurst: round4(hurst),
    slope: round6(slope),
    rSquared: round4(rSquared),
    toxicityProxy: round4(toxicityProxy),
    jitProxy: round4(jitProxy),
    hoursAnalyzed: returns.length,
  };
}

function hurstRS(returns: number[], meanR: number, stdR: number): number {
  if (stdR === 0) return 0.5;
  let cum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const r of returns) {
    cum += r - meanR;
    if (cum < min) min = cum;
    if (cum > max) max = cum;
  }
  const range = max - min;
  if (range <= 0) return 0.5;
  const rs = range / stdR;
  const h = Math.log(rs) / Math.log(returns.length);
  return Math.max(0, Math.min(1, h));
}

function logPriceTrend(prices: number[]): { slope: number; rSquared: number } {
  const y = prices.map((p) => Math.log(p));
  const nPts = y.length;
  const xs = Array.from({ length: nPts }, (_, i) => i);
  const mx = mean(xs);
  const my = mean(y);

  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < nPts; i++) {
    const dx = xs[i]! - mx;
    const dy = y[i]! - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  const slope = sxx > 0 ? sxy / sxx : 0;
  const rSquared = sxx > 0 && syy > 0 ? (sxy * sxy) / (sxx * syy) : 0;
  return { slope, rSquared };
}

function mean(arr: number[]): number {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr: number[], m: number): number {
  const v = arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length;
  return Math.sqrt(v);
}

function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}

function round6(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}
