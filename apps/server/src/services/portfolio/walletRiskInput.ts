import { getAddress, type Address, type PublicClient } from "viem";
import type { ServerConfig } from "../../config.js";
import { requireAddress } from "../robinhood/client.js";
import {
  scanNfpmTransfersForWallet,
  readNfpmPositionsByTokenIds,
  type NfpmPositionSnapshot,
  type TransferScanResult,
} from "../robinhood/transferScanner.js";
import { v3FactoryAbi, v3PoolAbi } from "../robinhood/abis.js";
import type { PortfolioRiskInput } from "../robinhood/riskEngine.js";
import type { PortfolioReportSource } from "./report.js";

export interface WalletRiskInputResult {
  riskInput: PortfolioRiskInput;
  scan: TransferScanResult;
  sources: PortfolioReportSource[];
  poolState: WalletPoolStateResult;
}

interface PositionPoolState {
  tokenId: bigint;
  poolAddress: Address;
  currentTick: number;
  tickLower: number;
  tickUpper: number;
  isInRange: boolean;
}

interface WalletPoolStateResult {
  positions: PositionPoolState[];
  source:
    | {
        status: "verified";
        blockNumber: bigint;
        factoryAddress: Address;
      }
    | {
        status: "unavailable";
        reason: string;
      };
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function scanRangeCount(
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint,
): bigint {
  if (toBlock < fromBlock) return 0n;
  return ((toBlock - fromBlock) / chunkSize) + 1n;
}

function positionLiquidity(position: NfpmPositionSnapshot): bigint {
  return position.liquidity;
}

function computeConcentrationBps(positions: NfpmPositionSnapshot[]): bigint {
  const liquidities = positions.map(positionLiquidity);
  const total = liquidities.reduce((sum, value) => sum + value, 0n);
  if (total === 0n) return 0n;

  const max = liquidities.reduce(
    (currentMax, value) => (value > currentMax ? value : currentMax),
    0n,
  );
  return (max * 10_000n) / total;
}

function pairKey(position: NfpmPositionSnapshot): string {
  const [left, right] = [position.token0.toLowerCase(), position.token1.toLowerCase()].sort();
  return `${left}:${right}:${position.fee}`;
}

function computePairExposureBps(positions: NfpmPositionSnapshot[]): bigint {
  const total = positions.reduce(
    (sum, position) => sum + positionLiquidity(position),
    0n,
  );
  if (total === 0n) return 0n;

  const byPair = new Map<string, bigint>();
  for (const position of positions) {
    const key = pairKey(position);
    byPair.set(key, (byPair.get(key) ?? 0n) + positionLiquidity(position));
  }

  const maxPair = [...byPair.values()].reduce(
    (currentMax, value) => (value > currentMax ? value : currentMax),
    0n,
  );
  return (maxPair * 10_000n) / total;
}

async function readPositionPoolState(
  client: PublicClient,
  factoryAddress: Address,
  position: NfpmPositionSnapshot,
): Promise<PositionPoolState | null> {
  const poolAddress = await client.readContract({
    address: factoryAddress,
    abi: v3FactoryAbi,
    functionName: "getPool",
    args: [position.token0, position.token1, position.fee],
  });

  if (poolAddress.toLowerCase() === ZERO_ADDRESS) return null;

  const [, tick] = await client.readContract({
    address: poolAddress,
    abi: v3PoolAbi,
    functionName: "slot0",
  });
  const currentTick = Number(tick);

  return {
    tokenId: position.tokenId,
    poolAddress: getAddress(poolAddress),
    currentTick,
    tickLower: position.tickLower,
    tickUpper: position.tickUpper,
    isInRange:
      currentTick >= position.tickLower && currentTick < position.tickUpper,
  };
}

async function readWalletPoolState(
  config: ServerConfig,
  client: PublicClient,
  positions: NfpmPositionSnapshot[],
): Promise<WalletPoolStateResult> {
  if (!config.robinhoodV3FactoryAddress) {
    return {
      positions: [],
      source: {
        status: "unavailable",
        reason: "ROBINHOOD_V3_FACTORY_ADDRESS is not configured.",
      },
    };
  }

  const factoryAddress = requireAddress(
    config.robinhoodV3FactoryAddress,
    "ROBINHOOD_V3_FACTORY_ADDRESS",
  );

  try {
    const blockNumber = await client.getBlockNumber();
    const results = await Promise.all(
      positions.map((position) =>
        readPositionPoolState(client, factoryAddress, position).catch(() => null),
      ),
    );

    return {
      positions: results.filter((result): result is PositionPoolState =>
        result !== null,
      ),
      source: {
        status: "verified",
        blockNumber,
        factoryAddress,
      },
    };
  } catch (error) {
    return {
      positions: [],
      source: {
        status: "unavailable",
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function buildWalletRiskInputFromRobinhood(
  config: ServerConfig,
  client: PublicClient,
  walletAddress: Address,
): Promise<WalletRiskInputResult> {
  const latestBlock = await client.getBlockNumber();
  const nfpmAddress = requireAddress(
    config.robinhoodNfpmAddress,
    "ROBINHOOD_NFPM_ADDRESS",
  );
  const fromBlock = config.robinhoodScanFromBlock ?? 0n;
  const rangeCount = scanRangeCount(
    fromBlock,
    latestBlock,
    config.robinhoodScanChunkSize,
  );

  let scan: TransferScanResult;

  // Shortcut: canonical wallet with a known tokenId skips Transfer-event scan
  // entirely. Free-tier RPCs (e.g. Alchemy) cap eth_getLogs at 10 blocks/call,
  // making a full Transfer scan prohibitively expensive (~80k calls for the
  // current block range). ownerOf + positions calls are single reads — fast.
  const canonicalWallet = config.robinhoodCanonicalWalletAddress?.toLowerCase();
  const canonicalTokenId = config.robinhoodCanonicalTokenId;
  const isCanonicalWallet =
    canonicalTokenId &&
    canonicalWallet &&
    walletAddress.toLowerCase() === canonicalWallet;

  if (isCanonicalWallet) {
    scan = await readNfpmPositionsByTokenIds(
      client,
      nfpmAddress,
      walletAddress,
      [BigInt(canonicalTokenId)],
      latestBlock,
    );
  } else if (rangeCount > config.robinhoodMaxScanRanges) {
    throw new Error(
      `Robinhood NFPM scan range is too large: ${rangeCount.toString()} chunks from block ${fromBlock.toString()} to ${latestBlock.toString()} with chunk size ${config.robinhoodScanChunkSize.toString()}. Set ROBINHOOD_SCAN_FROM_BLOCK closer to the first relevant transfer or raise ROBINHOOD_MAX_SCAN_RANGES deliberately.`,
    );
  } else {
    scan = await scanNfpmTransfersForWallet(client, {
      nfpmAddress,
      walletAddress,
      fromBlock,
      toBlock: latestBlock,
      chunkSize: config.robinhoodScanChunkSize,
    });
  }
  const positions = scan.positions;
  const dustPositions = positions.filter((position) => position.liquidity === 0n);
  const poolState = await readWalletPoolState(config, client, positions);
  const outOfRangePositions =
    poolState.source.status === "verified"
      ? BigInt(
          poolState.positions.filter((position) => !position.isInRange).length,
        )
      : 0n;
  const poolStateSource: PortfolioReportSource =
    poolState.source.status === "verified"
      ? {
          name: "Robinhood pool current tick",
          label: "VERIFIED",
          chainId: config.robinhoodChainId,
          blockNumber: poolState.source.blockNumber,
          contractAddress: poolState.source.factoryAddress,
          notes: [
            `Resolved current ticks for ${poolState.positions.length} of ${positions.length} positions.`,
          ],
        }
      : {
          name: "Robinhood pool current tick",
          label: "UNAVAILABLE",
          chainId: config.robinhoodChainId,
          blockNumber: latestBlock,
          notes: [
            poolState.source.reason,
            "outOfRangePositions is set to 0 until Robinhood pool current tick lookup is configured.",
          ],
        };

  return {
    riskInput: {
      totalPositions: BigInt(positions.length),
      outOfRangePositions,
      dustPositions: BigInt(dustPositions.length),
      correlatedExposureBps: computePairExposureBps(positions),
      concentrationBps: computeConcentrationBps(positions),
    },
    scan,
    poolState,
    sources: [
      {
        name: "Robinhood NFPM Transfer scan",
        label: "VERIFIED",
        chainId: config.robinhoodChainId,
        blockNumber: latestBlock,
        contractAddress: nfpmAddress,
        notes: [
          `Scanned ${scan.transfers.length} transfer events and verified ${scan.currentlyOwnedTokenIds.length} current ownerOf results.`,
        ],
      },
      {
        name: "Robinhood NFPM positions aggregate",
        label: "COMPUTED",
        chainId: config.robinhoodChainId,
        blockNumber: latestBlock,
        contractAddress: nfpmAddress,
        notes: [
          "totalPositions, dustPositions, pair exposure, and concentration are derived from verified NFPM snapshots.",
        ],
      },
      poolStateSource,
    ],
  };
}
