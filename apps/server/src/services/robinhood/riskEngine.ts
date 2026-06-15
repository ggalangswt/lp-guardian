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
  riskTier: 0 | 1 | 2;
  recommendedAction: 0 | 1 | 2;
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
    riskTier: riskTier as 0 | 1 | 2,
    recommendedAction: recommendedAction as 0 | 1 | 2,
  };
}
