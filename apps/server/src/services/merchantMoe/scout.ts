import { getAddress, isAddress, type Address } from "viem";
import type { ServerConfig } from "../../config.js";
import type {
  NfpmPositionSnapshot,
  TransferScanResult,
} from "../robinhood/transferScanner.js";
import type { WalletRiskInputResult } from "../portfolio/walletRiskInput.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as Address;
const GRAPH_TIMEOUT_MS = 4_000;

const RICH_POSITIONS_QUERY = /* GraphQL */ `
  query MerchantMoeWalletPositions($owner: Bytes!) {
    positions(first: 1000, where: { owner: $owner }) {
      id
      owner
      liquidity
      tickLower { tickIdx }
      tickUpper { tickIdx }
      depositedToken0
      depositedToken1
      collectedFeesToken0
      collectedFeesToken1
      pool {
        id
        feeTier
        tick
        token0 { id symbol decimals }
        token1 { id symbol decimals }
      }
    }
  }
`;

const MINIMAL_POSITIONS_QUERY = /* GraphQL */ `
  query MerchantMoeWalletPositions($owner: Bytes!) {
    positions(first: 1000, where: { owner: $owner }) {
      id
      owner
      liquidity
      tickLower { tickIdx }
      tickUpper { tickIdx }
      pool {
        id
        feeTier
        tick
        token0 { id symbol decimals }
        token1 { id symbol decimals }
      }
    }
  }
`;

interface GraphPositionToken {
  id?: unknown;
  symbol?: unknown;
  decimals?: unknown;
}

interface GraphPositionPool {
  id?: unknown;
  feeTier?: unknown;
  tick?: unknown;
  token0?: GraphPositionToken;
  token1?: GraphPositionToken;
}

interface GraphPosition {
  id?: unknown;
  owner?: unknown;
  liquidity?: unknown;
  tickLower?: { tickIdx?: unknown };
  tickUpper?: { tickIdx?: unknown };
  depositedToken0?: unknown;
  depositedToken1?: unknown;
  collectedFeesToken0?: unknown;
  collectedFeesToken1?: unknown;
  pool?: GraphPositionPool;
}

interface GraphResponse {
  data?: {
    positions?: GraphPosition[];
  };
  errors?: { message?: string }[];
}

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

function unavailable(
  config: ServerConfig,
  walletAddress: Address,
  reason: string,
  notes: string[],
): WalletRiskInputResult {
  return {
    riskInput: {
      totalPositions: 0n,
      outOfRangePositions: 0n,
      dustPositions: 0n,
      correlatedExposureBps: 0n,
      concentrationBps: 0n,
    },
    scan: emptyScan(walletAddress),
    poolState: {
      positions: [],
      source: {
        status: "unavailable",
        reason,
      },
    },
    sources: [
      {
        name: "Merchant Moe Scout adapter",
        label: "UNAVAILABLE",
        chainId: config.mantleChainId,
        notes,
      },
    ],
  };
}

function toBigInt(value: unknown, fallback = 0n): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isFinite(value)) {
    return BigInt(Math.trunc(value));
  }
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed) || /^0x[0-9a-fA-F]+$/.test(trimmed)) {
    return BigInt(trimmed);
  }
  return fallback;
}

function toNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "bigint") return Number(value);
  if (typeof value !== "string") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toAddress(value: unknown): Address {
  return typeof value === "string" && isAddress(value)
    ? getAddress(value)
    : ZERO_ADDRESS;
}

function tokenIdFromPositionId(value: unknown, fallback: number): bigint {
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value !== "string") return BigInt(fallback);
  if (/^\d+$/.test(value) || /^0x[0-9a-fA-F]+$/.test(value)) {
    return BigInt(value);
  }

  const numericSuffix = value.match(/(\d+)$/);
  return numericSuffix ? BigInt(numericSuffix[1]!) : BigInt(fallback);
}

function sameAddress(left: string, right: string): boolean {
  return left.toLowerCase() === right.toLowerCase();
}

function computeConcentrationBps(positions: NfpmPositionSnapshot[]): bigint {
  const total = positions.reduce((sum, position) => sum + position.liquidity, 0n);
  if (total === 0n) return 0n;
  const max = positions.reduce(
    (currentMax, position) =>
      position.liquidity > currentMax ? position.liquidity : currentMax,
    0n,
  );
  return (max * 10_000n) / total;
}

function computePairExposureBps(positions: NfpmPositionSnapshot[]): bigint {
  const total = positions.reduce((sum, position) => sum + position.liquidity, 0n);
  if (total === 0n) return 0n;

  const exposureByPair = new Map<string, bigint>();
  for (const position of positions) {
    const [left, right] = [
      position.token0.toLowerCase(),
      position.token1.toLowerCase(),
    ].sort();
    const key = `${left}:${right}:${position.fee}`;
    exposureByPair.set(key, (exposureByPair.get(key) ?? 0n) + position.liquidity);
  }

  const maxPair = [...exposureByPair.values()].reduce(
    (currentMax, value) => (value > currentMax ? value : currentMax),
    0n,
  );
  return (maxPair * 10_000n) / total;
}

function toPositionSnapshot(
  raw: GraphPosition,
  walletAddress: Address,
  chainId: number,
  index: number,
): NfpmPositionSnapshot | undefined {
  const pool = raw.pool;
  const token0 = toAddress(pool?.token0?.id);
  const token1 = toAddress(pool?.token1?.id);
  const poolAddress = toAddress(pool?.id);
  if (token0 === ZERO_ADDRESS || token1 === ZERO_ADDRESS) return undefined;

  const tokenId = tokenIdFromPositionId(raw.id, index + 1);
  const currentTick = raw.pool?.tick === null || raw.pool?.tick === undefined
    ? undefined
    : toNumber(raw.pool.tick);
  const tickLower = toNumber(raw.tickLower?.tickIdx);
  const tickUpper = toNumber(raw.tickUpper?.tickIdx);
  const owner = typeof raw.owner === "string" && isAddress(raw.owner)
    ? getAddress(raw.owner)
    : walletAddress;
  const isInRange = currentTick === undefined
    ? undefined
    : currentTick >= tickLower && currentTick < tickUpper;

  return {
    tokenId,
    owner,
    token0,
    token1,
    fee: toNumber(pool?.feeTier),
    tickLower,
    tickUpper,
    liquidity: toBigInt(raw.liquidity),
    tokensOwed0: toBigInt(raw.collectedFeesToken0),
    tokensOwed1: toBigInt(raw.collectedFeesToken1),
    protocol: "merchant-moe",
    chainId,
    poolAddress,
    currentTick,
    token0Symbol:
      typeof pool?.token0?.symbol === "string" ? pool.token0.symbol : undefined,
    token1Symbol:
      typeof pool?.token1?.symbol === "string" ? pool.token1.symbol : undefined,
    token0Decimals: toNumber(pool?.token0?.decimals, 18),
    token1Decimals: toNumber(pool?.token1?.decimals, 18),
    isInRange,
  };
}

async function postGraphql(
  url: string,
  query: string,
  owner: Address,
): Promise<GraphPosition[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GRAPH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query,
        variables: { owner: owner.toLowerCase() },
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`Merchant Moe subgraph returned HTTP ${response.status}.`);
    }

    const payload = (await response.json()) as GraphResponse;
    if (payload.errors?.length) {
      throw new Error(
        payload.errors
          .map((error) => error.message)
          .filter(Boolean)
          .join("; ") || "Merchant Moe subgraph returned GraphQL errors.",
      );
    }

    return payload.data?.positions ?? [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchMerchantMoePositions(
  url: string,
  walletAddress: Address,
): Promise<GraphPosition[]> {
  try {
    return await postGraphql(url, RICH_POSITIONS_QUERY, walletAddress);
  } catch (richError) {
    try {
      return await postGraphql(url, MINIMAL_POSITIONS_QUERY, walletAddress);
    } catch (minimalError) {
      const richMessage =
        richError instanceof Error ? richError.message : String(richError);
      const minimalMessage =
        minimalError instanceof Error ? minimalError.message : String(minimalError);
      throw new Error(
        `Rich query failed: ${richMessage}; minimal query failed: ${minimalMessage}`,
      );
    }
  }
}

export async function buildWalletRiskInputFromMerchantMoe(
  config: ServerConfig,
  walletAddress: Address,
): Promise<WalletRiskInputResult> {
  if (!config.merchantMoeSubgraphUrl) {
    return unavailable(
      config,
      walletAddress,
      "MERCHANT_MOE_SUBGRAPH_URL is not configured.",
      [
        "Merchant Moe is the Mantle-first Scout source, but its subgraph URL is not configured yet.",
        "Returning an empty degraded scan instead of falling back silently to another chain.",
      ],
    );
  }

  let rawPositions: GraphPosition[];
  try {
    rawPositions = await fetchMerchantMoePositions(
      config.merchantMoeSubgraphUrl,
      walletAddress,
    );
  } catch (error) {
    return unavailable(
      config,
      walletAddress,
      error instanceof Error ? error.message : String(error),
      [
        "Merchant Moe subgraph query failed; no verified Scout output was produced.",
      ],
    );
  }

  const positions = rawPositions
    .map((position, index) =>
      toPositionSnapshot(position, walletAddress, config.mantleChainId, index),
    )
    .filter((position): position is NfpmPositionSnapshot => Boolean(position))
    .filter((position) => sameAddress(position.owner, walletAddress));
  const currentlyOwnedTokenIds = positions
    .map((position) => position.tokenId)
    .sort((left, right) => Number(left - right));
  const outOfRangePositions = BigInt(
    positions.filter((position) => position.isInRange === false).length,
  );
  const dustPositions = BigInt(
    positions.filter((position) => position.liquidity === 0n).length,
  );
  const scan: TransferScanResult = {
    ...emptyScan(walletAddress),
    candidateTokenIds: currentlyOwnedTokenIds,
    currentlyOwnedTokenIds,
    positions,
  };

  return {
    riskInput: {
      totalPositions: BigInt(positions.length),
      outOfRangePositions,
      dustPositions,
      correlatedExposureBps: computePairExposureBps(positions),
      concentrationBps: computeConcentrationBps(positions),
    },
    scan,
    poolState: {
      positions: positions
        .filter(
          (position) =>
            position.poolAddress &&
            position.currentTick !== undefined &&
            position.isInRange !== undefined,
        )
        .map((position) => ({
          tokenId: position.tokenId,
          poolAddress: position.poolAddress!,
          currentTick: position.currentTick!,
          tickLower: position.tickLower,
          tickUpper: position.tickUpper,
          isInRange: position.isInRange!,
        })),
      source: {
        status: "unavailable",
        reason:
          positions.length > 0
            ? "Merchant Moe pool ticks came from subgraph snapshots, not direct Mantle RPC reads."
            : "Merchant Moe subgraph returned no wallet positions.",
      },
    },
    sources: [
      {
        name: "Merchant Moe Scout adapter",
        label: "VERIFIED",
        chainId: config.mantleChainId,
        notes: [
          `Queried Merchant Moe subgraph and normalized ${positions.length} LP positions for this wallet.`,
          "Pool tick values are subgraph snapshots; direct Mantle RPC verification is still pending.",
        ],
      },
      {
        name: "Merchant Moe portfolio aggregate",
        label: "COMPUTED",
        chainId: config.mantleChainId,
        notes: [
          "totalPositions, dustPositions, outOfRangePositions, pair exposure, and concentration are derived from normalized Merchant Moe positions.",
        ],
      },
    ],
  };
}
