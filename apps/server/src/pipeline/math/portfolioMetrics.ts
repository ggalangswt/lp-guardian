import type { ServerConfig } from "../../config.js";
import type { RiskInput } from "../../chain/riskEngine.js";
import type { V3PositionRaw } from "../../indexer/types.js";

// Arbitrum One ETH-correlated cluster (WETH + LSDs). Exposure to any of these
// counts toward the correlated-exposure metric.
const ETH_CLUSTER = new Set<string>([
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // WETH
  "0x5979d7b546e38e414f7e9822514be443a4800529", // wstETH
  "0xec70dcb4a1efa46b8f2d97c310c9c4790ba5ffa8", // rETH
  "0x35751007a407ca6feffe80b3cb397736d2cf4dbe", // weETH
  "0x2416092f143378750bb29b79ed961ab195cceea5", // ezETH
]);

/**
 * Computes the aggregate portfolio metrics consumed by the on-chain
 * PortfolioRiskEngine. Values are derived from per-position USD value and range
 * state produced by the indexer.
 */
export function computePortfolioMetrics(
  positions: V3PositionRaw[],
  config: ServerConfig,
): RiskInput {
  const total = positions.length;
  if (total === 0) {
    return {
      totalPositions: 0,
      outOfRangePositions: 0,
      dustPositions: 0,
      correlatedExposureBps: 0,
      concentrationBps: 0,
    };
  }

  let outOfRange = 0;
  let dust = 0;
  let totalValue = 0;
  let ethClusterValue = 0;
  let largestValue = 0;

  for (const p of positions) {
    const value = p.currentValueUSD ?? 0;
    totalValue += value;
    if (value > largestValue) largestValue = value;

    if (p.isInRange === false || isOutOfRange(p)) outOfRange++;
    if (value > 0 && value < config.dustThresholdUsd) dust++;

    const t0 = p.pool.token0.id.toLowerCase();
    const t1 = p.pool.token1.id.toLowerCase();
    if (ETH_CLUSTER.has(t0) || ETH_CLUSTER.has(t1)) ethClusterValue += value;
  }

  const correlatedExposureBps =
    totalValue > 0 ? Math.round((ethClusterValue / totalValue) * 10_000) : 0;
  const concentrationBps =
    totalValue > 0 ? Math.round((largestValue / totalValue) * 10_000) : 0;

  return {
    totalPositions: total,
    outOfRangePositions: outOfRange,
    dustPositions: dust,
    correlatedExposureBps,
    concentrationBps,
  };
}

function isOutOfRange(p: V3PositionRaw): boolean {
  const tickRaw = p.pool.tick;
  if (tickRaw === null || tickRaw === "") return false;
  const cur = Number(tickRaw);
  const lo = Number(p.tickLower.tickIdx);
  const hi = Number(p.tickUpper.tickIdx);
  if (!Number.isFinite(cur) || !Number.isFinite(lo) || !Number.isFinite(hi)) {
    return false;
  }
  return cur < lo || cur >= hi;
}
