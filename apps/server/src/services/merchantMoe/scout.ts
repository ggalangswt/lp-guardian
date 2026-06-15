import type { Address } from "viem";
import type { ServerConfig } from "../../config.js";
import type { TransferScanResult } from "../robinhood/transferScanner.js";
import type { WalletRiskInputResult } from "../portfolio/walletRiskInput.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;

function emptyScan(walletAddress: Address): TransferScanResult {
  return {
    walletAddress,
    nfpmAddress: ZERO_ADDRESS,
    fromBlock: 0n,
    toBlock: 0n,
    transfers: [],
    candidateTokenIds: [],
    currentlyOwnedTokenIds: [],
    movedOutTokenIds: [],
    positions: [],
  };
}

export async function buildWalletRiskInputFromMerchantMoe(
  config: ServerConfig,
  walletAddress: Address,
): Promise<WalletRiskInputResult> {
  const scan = emptyScan(walletAddress);

  if (!config.merchantMoeSubgraphUrl) {
    return {
      riskInput: {
        totalPositions: 0n,
        outOfRangePositions: 0n,
        dustPositions: 0n,
        correlatedExposureBps: 0n,
        concentrationBps: 0n,
      },
      scan,
      poolState: {
        positions: [],
        source: {
          status: "unavailable",
          reason: "MERCHANT_MOE_SUBGRAPH_URL is not configured.",
        },
      },
      sources: [
        {
          name: "Merchant Moe Scout adapter",
          label: "UNAVAILABLE",
          chainId: config.mantleChainId,
          notes: [
            "Merchant Moe is the Mantle-first Scout source, but its subgraph URL is not configured yet.",
            "Returning an empty degraded scan instead of falling back silently to another chain.",
          ],
        },
      ],
    };
  }

  return {
    riskInput: {
      totalPositions: 0n,
      outOfRangePositions: 0n,
      dustPositions: 0n,
      correlatedExposureBps: 0n,
      concentrationBps: 0n,
    },
    scan,
    poolState: {
      positions: [],
      source: {
        status: "unavailable",
        reason: "Merchant Moe subgraph query implementation is pending.",
      },
    },
    sources: [
      {
        name: "Merchant Moe Scout adapter",
        label: "UNAVAILABLE",
        chainId: config.mantleChainId,
        notes: [
          "MERCHANT_MOE_SUBGRAPH_URL is configured, but the query/indexing implementation is not wired in this BE Agent build.",
        ],
      },
    ],
  };
}
