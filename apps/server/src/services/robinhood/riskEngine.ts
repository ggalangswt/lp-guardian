import type { Address, PublicClient } from "viem";
import { portfolioRiskEngineAbi } from "./abis.js";

export interface PortfolioRiskInput {
  totalPositions: bigint;
  outOfRangePositions: bigint;
  dustPositions: bigint;
  correlatedExposureBps: bigint;
  concentrationBps: bigint;
}

export interface PortfolioRiskResult {
  riskScoreBps: bigint;
  riskTier: 0 | 1 | 2 | 3;
  recommendedAction: 0 | 1 | 2 | 3;
}

const BPS = 10_000n;

function clampBps(value: bigint): bigint {
  if (value < 0n) return 0n;
  return value > BPS ? BPS : value;
}

function ratioBps(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) return 0n;
  const capped = numerator > denominator ? denominator : numerator;
  return clampBps((capped * BPS) / denominator);
}

export function computePortfolioRiskOffchain(
  input: PortfolioRiskInput,
): PortfolioRiskResult {
  if (input.totalPositions === 0n) {
    return {
      riskScoreBps: 0n,
      riskTier: 0,
      recommendedAction: 0,
    };
  }

  const outOfRangeRatio = ratioBps(
    input.outOfRangePositions,
    input.totalPositions,
  );
  const dustRatio = ratioBps(input.dustPositions, input.totalPositions);
  const correlation = clampBps(input.correlatedExposureBps);
  const concentration = clampBps(input.concentrationBps);
  const riskScoreBps = clampBps(
    (outOfRangeRatio * 35n +
      dustRatio * 20n +
      correlation * 25n +
      concentration * 20n) / 100n,
  );
  const score = Number(riskScoreBps);
  const riskTier =
    score >= 8_000 ? 3 : score >= 5_000 ? 2 : score >= 2_000 ? 1 : 0;
  const recommendedAction =
    score >= 8_000 || input.dustPositions >= 5n
      ? 3
      : score >= 5_000
        ? 2
        : score >= 2_000
          ? 1
          : 0;

  return {
    riskScoreBps,
    riskTier,
    recommendedAction,
  };
}

export async function computePortfolioRisk(
  client: PublicClient,
  riskEngineAddress: Address,
  input: PortfolioRiskInput,
): Promise<PortfolioRiskResult> {
  const [riskScoreBps, riskTier, recommendedAction] =
    await client.readContract({
      address: riskEngineAddress,
      abi: portfolioRiskEngineAbi,
      functionName: "computeRisk",
      args: [
        input.totalPositions,
        input.outOfRangePositions,
        input.dustPositions,
        input.correlatedExposureBps,
        input.concentrationBps,
      ],
    });

  return {
    riskScoreBps,
    riskTier: riskTier as 0 | 1 | 2 | 3,
    recommendedAction: recommendedAction as 0 | 1 | 2 | 3,
  };
}
