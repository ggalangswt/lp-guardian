import type { ServerConfig } from "../config.js";
import { querySubgraph } from "../services/subgraph/graphClient.js";
import type { Protocol } from "./types.js";
import { fetchRecentSwaps, type FetchSwapsResult, type SwapEvent } from "./swapEvents.js";

/**
 * Swap indexing via The Graph, formatted per protocol (Uniswap v3, Uniswap v4,
 * Camelot/Algebra). Each subgraph's `swaps` entity returns amounts as decimal
 * token-units (BigDecimal) and only carries the pool's *current* liquidity — so
 * we convert amounts back to raw base units and use pool.liquidity as the
 * pro-rata attribution proxy. Output matches the RPC reader's `SwapEvent[]`, so
 * the replay engine (pipeline/swapReplay.ts) is unchanged.
 */

export interface SwapSourceResult extends FetchSwapsResult {
  /** Where the swaps came from — surfaced for honesty labelling. */
  source: "subgraph" | "rpc" | "none";
}

interface GraphSwap {
  amount0: string;
  amount1: string;
  tick: string | null;
  logIndex: string | null;
  timestamp: string;
  transaction: { blockNumber: string };
  pool: { liquidity: string | null };
}

interface GraphSwapsResponse {
  swaps: GraphSwap[];
}

// pool filter works for v3/v4 (pool = address|poolId) and Algebra alike.
const SWAPS_QUERY = /* GraphQL */ `
  query Swaps($pool: String!, $first: Int!) {
    swaps(
      where: { pool: $pool }
      orderBy: timestamp
      orderDirection: desc
      first: $first
    ) {
      amount0
      amount1
      tick
      logIndex
      timestamp
      transaction { blockNumber }
      pool { liquidity }
    }
  }
`;

/**
 * Fetches recent swaps for replay, choosing the source per protocol:
 *  - uniswap-v4 → subgraph only (no V3-style per-pool Swap event on-chain)
 *  - uniswap-v3 / camelot → subgraph first, RPC getLogs fallback
 *
 * `poolKey` is the pool *address* (v3/camelot) or the 32-byte poolId (v4).
 */
export async function getSwapsForReplay(
  config: ServerConfig,
  args: {
    protocol: Protocol;
    poolKey: string;
    token0Decimals: number;
    token1Decimals: number;
    maxSwaps?: number;
  },
): Promise<SwapSourceResult> {
  const maxSwaps = Math.min(1000, args.maxSwaps ?? config.swapReplayMaxSwaps);
  const subgraphId = subgraphIdFor(config, args.protocol);

  if (subgraphId) {
    const graph = await fetchSwapsFromGraph(config, subgraphId, {
      poolKey: args.poolKey,
      token0Decimals: args.token0Decimals,
      token1Decimals: args.token1Decimals,
      maxSwaps,
    });
    if (graph && graph.swaps.length > 0) return { ...graph, source: "subgraph" };
  }

  // V4 has no per-pool address to getLogs against — subgraph is the only source.
  if (args.protocol === "uniswap-v4") {
    return emptyResult();
  }

  // RPC fallback for v3/camelot (pool address available).
  if (/^0x[0-9a-fA-F]{40}$/.test(args.poolKey)) {
    const rpc = await fetchRecentSwaps(config, args.poolKey, { maxSwaps });
    return { ...rpc, source: rpc.swaps.length > 0 ? "rpc" : "none" };
  }

  return emptyResult();
}

function subgraphIdFor(config: ServerConfig, protocol: Protocol): string | null {
  switch (protocol) {
    case "uniswap-v3":
      return config.uniswapV3SubgraphId;
    case "uniswap-v4":
      return config.uniswapV4SubgraphId;
    case "camelot":
      return config.camelotSubgraphId;
    default:
      return null;
  }
}

async function fetchSwapsFromGraph(
  config: ServerConfig,
  subgraphId: string,
  args: {
    poolKey: string;
    token0Decimals: number;
    token1Decimals: number;
    maxSwaps: number;
  },
): Promise<FetchSwapsResult | null> {
  const data = await querySubgraph<GraphSwapsResponse>(config, subgraphId, SWAPS_QUERY, {
    pool: args.poolKey.toLowerCase(),
    first: args.maxSwaps,
  });
  if (!data || !Array.isArray(data.swaps)) return null;

  const swaps: SwapEvent[] = data.swaps.map((s, i) => ({
    blockNumber: BigInt(s.transaction?.blockNumber ?? "0"),
    // Algebra often returns null logIndex — fall back to array position.
    logIndex: s.logIndex != null ? Number(s.logIndex) : i,
    amount0: toRawUnits(s.amount0, args.token0Decimals),
    amount1: toRawUnits(s.amount1, args.token1Decimals),
    liquidity: s.pool?.liquidity ? BigInt(s.pool.liquidity) : 0n,
    tick: s.tick != null ? Number(s.tick) : 0,
  }));

  // Order oldest → newest for a stable, reproducible replay hash.
  swaps.sort((a, b) =>
    a.blockNumber === b.blockNumber
      ? a.logIndex - b.logIndex
      : a.blockNumber < b.blockNumber
        ? -1
        : 1,
  );

  return {
    swaps,
    fromBlock: swaps.length > 0 ? swaps[0]!.blockNumber : 0n,
    toBlock: swaps.length > 0 ? swaps[swaps.length - 1]!.blockNumber : 0n,
    partial: false,
  };
}

/**
 * Converts a signed decimal token-amount string (e.g. "-1102.550509") to raw
 * base units, truncating any fractional digits beyond `decimals` (avoids
 * parseUnits throwing) and sidestepping Number precision loss.
 */
export function toRawUnits(decimalStr: string, decimals: number): bigint {
  if (!decimalStr) return 0n;
  const neg = decimalStr.startsWith("-");
  const body = neg ? decimalStr.slice(1) : decimalStr;
  const [intPart = "0", fracRaw = ""] = body.split(".");
  const frac = fracRaw.slice(0, decimals).padEnd(decimals, "0");
  const raw = BigInt((intPart || "0") + frac);
  return neg ? -raw : raw;
}

function emptyResult(): SwapSourceResult {
  return { swaps: [], fromBlock: 0n, toBlock: 0n, partial: false, source: "none" };
}
