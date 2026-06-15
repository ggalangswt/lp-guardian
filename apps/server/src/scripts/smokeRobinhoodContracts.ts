import { loadConfig } from "../config.js";
import {
  createRobinhoodPublicClient,
  requireAddress,
} from "../services/robinhood/client.js";
import { computePortfolioRisk } from "../services/robinhood/riskEngine.js";
import { portfolioReportRegistryAbi } from "../services/robinhood/abis.js";
import {
  jsonReplacer,
  loadDotEnvIfPresent,
  readArg,
} from "./support/env.js";

async function main(): Promise<void> {
  loadDotEnvIfPresent();

  const config = loadConfig();
  const client = createRobinhoodPublicClient(config);
  const expectedChainId = config.robinhoodChainId;
  const actualChainId = await client.getChainId();
  const riskEngineAddress = requireAddress(
    config.lpGuardianRiskEngineContract,
    "LPGUARDIAN_RISK_ENGINE_CONTRACT",
  );
  const reportsAddress = requireAddress(
    config.lpGuardianReportsContract,
    "LPGUARDIAN_REPORTS_CONTRACT",
  );
  const subjectId = BigInt(readArg("subject-id") ?? "605311");

  if (expectedChainId && actualChainId !== expectedChainId) {
    throw new Error(
      `RPC chainId mismatch: expected ${expectedChainId}, received ${actualChainId}.`,
    );
  }

  const reportCount = await client.readContract({
    address: reportsAddress,
    abi: portfolioReportRegistryAbi,
    functionName: "reportCount",
    args: [subjectId],
  });
  const risk = await computePortfolioRisk(client, riskEngineAddress, {
    totalPositions: BigInt(readArg("total-positions") ?? "10"),
    outOfRangePositions: BigInt(readArg("out-of-range") ?? "9"),
    dustPositions: BigInt(readArg("dust") ?? "3"),
    correlatedExposureBps: BigInt(readArg("correlation-bps") ?? "6000"),
    concentrationBps: BigInt(readArg("concentration-bps") ?? "7000"),
  });

  console.log(
    JSON.stringify(
      {
        chainId: actualChainId,
        contracts: {
          reports: reportsAddress,
          riskEngine: riskEngineAddress,
        },
        reportCount: {
          subjectId,
          value: reportCount,
        },
        risk,
      },
      jsonReplacer,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Robinhood contract smoke test failed: ${message}`);
  process.exitCode = 1;
});
