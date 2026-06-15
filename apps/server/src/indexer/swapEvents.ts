import type { PublicClient } from "viem";
import type { ServerConfig } from "../config.js";
import { getChainClients } from "../chain/clients.js";
import { univ3SwapEventAbi } from "../chain/abis.js";

/** One real Swap pulled from the pool's Arbitrum logs. Amounts are signed in the
 *  pool's convention: a positive amount is paid *into* the pool (the swap input),
 *  a negative amount is paid *out*. `tick` is the pool tick after the swap. */
export interface SwapEvent {
  blockNumber: bigint;
  logIndex: number;
  amount0: bigint;
  amount1: bigint;
  liquidity: bigint;
  tick: number;
}

export interface FetchSwapsResult {
  swaps: SwapEvent[];
  fromBlock: bigint;
  toBlock: bigint;
  /** true when at least one log query failed (partial window). */
  partial: boolean;
}

const CHUNK = 9_000n; // stay under common eth_getLogs block-span limits

/**
 * Pulls the most recent Swap events for a pool, walking backwards from the chain
 * head in bounded chunks until `maxSwaps` is reached or the window is exhausted.
 * Returned swaps are ordered oldest → newest.
 */
export async function fetchRecentSwaps(
  config: ServerConfig,
  poolAddress: string,
  opts: { maxSwaps?: number; blockWindow?: number; client?: PublicClient } = {},
): Promise<FetchSwapsResult> {
  const client = opts.client ?? getChainClients(config).arbitrum;
  const maxSwaps = Math.min(1000, opts.maxSwaps ?? config.swapReplayMaxSwaps);
  const window = BigInt(opts.blockWindow ?? config.swapReplayBlockWindow);
  const address = poolAddress as `0x${string}`;

  const head = await client.getBlockNumber();
  const floor = head > window ? head - window : 0n;

  const collected: SwapEvent[] = [];
  let partial = false;
  let cursor = head;
  let earliest = head;

  while (cursor >= floor && collected.length < maxSwaps) {
    const start = cursor > CHUNK ? cursor - CHUNK + 1n : 0n;
    const from = start < floor ? floor : start;
    try {
      const logs = await client.getLogs({
        address,
        event: univ3SwapEventAbi[0],
        fromBlock: from,
        toBlock: cursor,
      });
      for (const log of logs) {
        const a = log.args as {
          amount0?: bigint;
          amount1?: bigint;
          liquidity?: bigint;
          tick?: number;
        };
        collected.push({
          blockNumber: log.blockNumber ?? 0n,
          logIndex: log.logIndex ?? 0,
          amount0: a.amount0 ?? 0n,
          amount1: a.amount1 ?? 0n,
          liquidity: a.liquidity ?? 0n,
          tick: Number(a.tick ?? 0),
        });
      }
      earliest = from;
    } catch (err) {
      console.warn(`[swapEvents] getLogs ${from}-${cursor} failed: ${String(err)}`);
      partial = true;
    }
    if (from === 0n) break;
    cursor = from - 1n;
  }

  // Order oldest → newest, then keep the most recent `maxSwaps`.
  collected.sort((x, y) =>
    x.blockNumber === y.blockNumber
      ? x.logIndex - y.logIndex
      : x.blockNumber < y.blockNumber
        ? -1
        : 1,
  );
  const swaps =
    collected.length > maxSwaps ? collected.slice(collected.length - maxSwaps) : collected;

  return {
    swaps,
    fromBlock: swaps.length > 0 ? swaps[0]!.blockNumber : earliest,
    toBlock: swaps.length > 0 ? swaps[swaps.length - 1]!.blockNumber : head,
    partial,
  };
}
