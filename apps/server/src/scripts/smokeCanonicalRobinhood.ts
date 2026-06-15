import type { Address } from "viem";
import { loadConfig } from "../config.js";
import {
  jsonReplacer,
  loadDotEnvIfPresent,
  readArg,
} from "./support/env.js";
import {
  createRobinhoodPublicClient,
  requireAddress,
} from "../services/robinhood/client.js";
import { validateNfpmTokenOwnership } from "../services/ownership.js";
import { buildWalletRiskInputFromRobinhood } from "../services/portfolio/walletRiskInput.js";

function boolArg(name: string, fallback = false): boolean {
  const value = readArg(name);
  if (value === undefined) return fallback;
  return value === "1" || value === "true";
}

function scanRangeCount(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint,
): bigint {
  if (toBlock < fromBlock) return 0n;
  return ((toBlock - fromBlock) / chunkSize) + 1n;
}

function requireEnvAddress(name: string): Address {
  return requireAddress(process.env[name], name);
}

async function main(): Promise<void> {
  loadDotEnvIfPresent();

  const config = loadConfig();
  const client = createRobinhoodPublicClient(config);
  const walletAddress = requireEnvAddress("ROBINHOOD_CANONICAL_WALLET_ADDRESS");
  const tokenId = process.env.ROBINHOOD_CANONICAL_TOKEN_ID;
  if (!tokenId || !/^\d+$/.test(tokenId)) {
    throw new Error("ROBINHOOD_CANONICAL_TOKEN_ID must be set.");
  }

  const latestBlock = await client.getBlockNumber();
  const ownership = await validateNfpmTokenOwnership({
    client,
    chainId: config.robinhoodChainId,
    nfpmAddress: config.robinhoodNfpmAddress as Address | undefined,
    walletAddress,
    tokenId,
    blockNumber: latestBlock,
  });

  const shouldScan = boolArg("scan", false);
  const fromBlock = config.robinhoodScanFromBlock ?? 0n;
  const estimatedScanRanges = scanRangeCount(
    fromBlock,
    latestBlock,
    config.robinhoodScanChunkSize,
  );
  const walletRisk =
    shouldScan && estimatedScanRanges <= config.robinhoodMaxScanRanges
      ? await buildWalletRiskInputFromRobinhood(config, client, walletAddress)
      : undefined;

  console.log(
    JSON.stringify(
      {
        canonical: {
          hasWalletAddress: true,
          hasTokenId: true,
        },
        chain: {
          chainId: config.robinhoodChainId,
          latestBlock,
          nfpmConfigured: Boolean(config.robinhoodNfpmAddress),
          v3FactoryConfigured: Boolean(config.robinhoodV3FactoryAddress),
          scanFromBlock: config.robinhoodScanFromBlock ?? null,
          scanChunkSize: config.robinhoodScanChunkSize,
          estimatedScanRanges,
          maxScanRanges: config.robinhoodMaxScanRanges,
        },
        ownership: {
          status: ownership.status,
          label: ownership.status === "verified" ? "VERIFIED" : "EMULATED",
          hasOwnerAddress: Boolean(ownership.ownerAddress),
          hasReason: Boolean(ownership.reason),
        },
        walletScan: walletRisk
          ? {
              transferCount: walletRisk.scan.transfers.length,
              candidateTokenCount: walletRisk.scan.candidateTokenIds.length,
              currentlyOwnedTokenCount:
                walletRisk.scan.currentlyOwnedTokenIds.length,
              positionCount: walletRisk.scan.positions.length,
              poolStateStatus: walletRisk.poolState.source.status,
              riskInput: walletRisk.riskInput,
            }
          : {
              skipped: true,
              reason: shouldScan
                ? "Scan range exceeds ROBINHOOD_MAX_SCAN_RANGES. Move ROBINHOOD_SCAN_FROM_BLOCK closer to the first relevant transfer."
                : "Pass --scan=true after ROBINHOOD_SCAN_FROM_BLOCK is close enough for the provider rate limits.",
            },
      },
      jsonReplacer,
      2,
    ),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Canonical Robinhood smoke failed: ${message}`);
  process.exitCode = 1;
});
