import { loadConfig, loadLocalEnv } from "../config.js";
import { PortfolioService } from "../services/portfolio/portfolioService.js";
import type { Address } from "viem";

function actionName(value: 0 | 1 | 2 | 3): string {
  switch (value) {
    case 0:
      return "hold";
    case 1:
      return "rebalance";
    case 2:
    case 3:
      return "close";
  }
}

/**
 * Integration test script that uses real RPC to run the full diagnostic pipeline.
 * Usage: tsx src/scripts/integrationDiagnoseRpc.ts [tokenId]
 */
async function main() {
  loadLocalEnv();
  const config = loadConfig();
  const service = new PortfolioService(config);
  
  const tokenId = process.argv[2] ?? "225";
  const walletAddress = "0x536A844Ef215dD8A13a06023F24a568e4Ee3cB6B";

  console.log(`[integration] Running diagnostic for TokenId: ${tokenId} on Robinhood...`);
  console.log(`[integration] Wallet: ${walletAddress}`);

  try {
    const result = await service.diagnose({
      walletAddress: walletAddress as Address,
      tokenId,
      publishReport: true,
    });

    console.log("\n=== DIAGNOSIS COMPLETE ===");
    console.log(`Root Hash: ${result.report.rootHash}`);
    console.log(`Attestation Hash: ${result.attestationHash}`);
    console.log(`Anchor Status: ${result.anchor.status}`);
    if (result.anchor.status === "published") {
      console.log(`Tx Hash: ${result.anchor.txHash}`);
    }

    console.log("\n=== PORTFOLIO RISK ===");
    console.log(`Risk Score Bps: ${result.report.payload.riskOutput.riskScoreBps}`);
    console.log(`Risk Tier: ${result.report.payload.riskOutput.riskTier}`);
    console.log(
      `Recommended Action: ${actionName(result.report.payload.riskOutput.recommendedAction)}`,
    );

    console.log(`\n[integration] Pipeline completed successfully.`);
  } catch (err) {
    console.error(`\n[integration] Pipeline failed:`, err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

