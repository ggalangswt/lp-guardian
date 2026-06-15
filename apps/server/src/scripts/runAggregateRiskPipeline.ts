import type { Address, Hex } from "viem";
import { loadConfig } from "../config.js";
import {
  createRobinhoodPublicClient,
  createRobinhoodWalletClient,
  requireAddress,
} from "../services/robinhood/client.js";
import { runAggregateRiskPipeline } from "../services/portfolio/aggregateRiskPipeline.js";
import {
  jsonReplacer,
  loadDotEnvIfPresent,
  readArg,
} from "./support/env.js";

const DEMO_WALLETS = {
  bleeding: "0x8f4daa33706d70677fd69e4e0d47e595bc820e95",
  mixed: "0x4d3e3d1a38505185ba86a1b1f3084195d556bc2a",
} as const;

function readBool(name: string, fallback = false): boolean {
  const value = readArg(name);
  if (!value) return fallback;
  return value === "true" || value === "1" || value === "yes";
}

function readBigInt(name: string, fallback: string): bigint {
  return BigInt(readArg(name) ?? fallback);
}

function readWallet(): Address {
  const wallet = readArg("wallet") ?? "mixed";
  const selected =
    wallet in DEMO_WALLETS
      ? DEMO_WALLETS[wallet as keyof typeof DEMO_WALLETS]
      : wallet;

  return requireAddress(selected, "wallet") as Address;
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();

  const config = loadConfig();
  const publicClient = createRobinhoodPublicClient(config);
  const publishReport = readBool("publish", false);
  const walletClient =
    publishReport && config.walletBackendPrivateKey
      ? createRobinhoodWalletClient(config)
      : undefined;
  const latestBlock = await publicClient.getBlockNumber();
  const phalaAttestationHash = readArg("phala-attestation-hash") as
    | Hex
    | undefined;

  const result = await runAggregateRiskPipeline(
    config,
    publicClient,
    walletClient,
    {
      walletAddress: readWallet(),
      subjectId: readBigInt("subject-id", "605311"),
      riskInput: {
        totalPositions: readBigInt("total-positions", "10"),
        outOfRangePositions: readBigInt("out-of-range", "9"),
        dustPositions: readBigInt("dust", "3"),
        correlatedExposureBps: readBigInt("correlation-bps", "6000"),
        concentrationBps: readBigInt("concentration-bps", "7000"),
      },
      sources: [
        {
          name: "PortfolioRiskEngine.computeRisk",
          label: "VERIFIED",
          chainId: config.robinhoodChainId,
          blockNumber: latestBlock,
          contractAddress: config.lpGuardianRiskEngineContract,
        },
      ],
      phalaAttestation: phalaAttestationHash
        ? {
            attestationHash: phalaAttestationHash,
            verifier: config.phalaAttestationVerifier,
            agentContract: config.phalaAgentContract,
          }
        : undefined,
      requirePhala: readBool("require-phala", false),
      publishReport,
    },
  );

  console.log(JSON.stringify(result, jsonReplacer, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Aggregate risk pipeline failed: ${message}`);
  process.exitCode = 1;
});
