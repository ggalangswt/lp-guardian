import type { ServerConfig } from "../config.js";
import { getChainClients } from "./clients.js";
import { portfolioRiskEngineAbi } from "./abis.js";

export interface RiskInput {
  totalPositions: number;
  outOfRangePositions: number;
  dustPositions: number;
  correlatedExposureBps: number;
  concentrationBps: number;
}

export type RiskTier = 0 | 1 | 2 | 3;
export type RiskAction = 0 | 1 | 2 | 3;

export interface RiskResult {
  riskScoreBps: number;
  riskTier: RiskTier;
  recommendedAction: RiskAction;
  /** "VERIFIED" when computed on-chain, "COMPUTED" when the off-chain mirror ran. */
  source: "onchain" | "offchain";
}

const BPS = 10_000n;

/** Pure TypeScript mirror of PortfolioRiskEngine — keeps the demo alive when
 *  the Robinhood RPC is unreachable, and is used for unit-equivalence checks. */
export function computeRiskOffchain(input: RiskInput): Omit<RiskResult, "source"> {
  const total = BigInt(Math.max(0, Math.trunc(input.totalPositions)));
  if (total === 0n) return { riskScoreBps: 0, riskTier: 0, recommendedAction: 0 };

  const ratioBps = (num: number) => {
    const n = BigInt(Math.max(0, Math.trunc(num)));
    const capped = n > total ? total : n;
    return (capped * BPS) / total;
  };

  const oor = ratioBps(input.outOfRangePositions);
  const dust = ratioBps(input.dustPositions);
  const corr = BigInt(Math.min(10_000, Math.max(0, Math.trunc(input.correlatedExposureBps))));
  const conc = BigInt(Math.min(10_000, Math.max(0, Math.trunc(input.concentrationBps))));

  const raw = oor * 35n + dust * 20n + corr * 25n + conc * 20n;
  const score = raw / 100n > BPS ? BPS : raw / 100n;
  const scoreNum = Number(score);

  const tier: RiskTier =
    scoreNum >= 8000 ? 3 : scoreNum >= 5000 ? 2 : scoreNum >= 2000 ? 1 : 0;
  const dustCount = Math.trunc(input.dustPositions);
  const action: RiskAction =
    scoreNum >= 8000 || dustCount >= 5
      ? 3
      : scoreNum >= 5000
        ? 2
        : scoreNum >= 2000
          ? 1
          : 0;

  return { riskScoreBps: scoreNum, riskTier: tier, recommendedAction: action };
}

/** Calls the deployed Stylus PortfolioRiskEngine on Robinhood Chain. Falls back
 *  to the off-chain mirror if the RPC call fails. */
export async function computeRisk(
  config: ServerConfig,
  input: RiskInput,
): Promise<RiskResult> {
  const { robinhood } = getChainClients(config);
  try {
    const [scoreBps, tier, action] = (await robinhood.readContract({
      address: config.riskEngineAddress,
      abi: portfolioRiskEngineAbi,
      functionName: "computeRisk",
      args: [
        BigInt(Math.max(0, Math.trunc(input.totalPositions))),
        BigInt(Math.max(0, Math.trunc(input.outOfRangePositions))),
        BigInt(Math.max(0, Math.trunc(input.dustPositions))),
        BigInt(Math.min(10_000, Math.max(0, Math.trunc(input.correlatedExposureBps)))),
        BigInt(Math.min(10_000, Math.max(0, Math.trunc(input.concentrationBps)))),
      ],
    })) as readonly [bigint, number, number];

    return {
      riskScoreBps: Number(scoreBps),
      riskTier: tier as RiskTier,
      recommendedAction: action as RiskAction,
      source: "onchain",
    };
  } catch (err) {
    console.warn(
      `[riskEngine] on-chain computeRisk failed, using off-chain mirror: ${String(err)}`,
    );
    return { ...computeRiskOffchain(input), source: "offchain" };
  }
}
