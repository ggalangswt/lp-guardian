import type { PublicClient } from "viem";

export type McResult<T = unknown> =
  | { status: "success"; result: T }
  | { status: "failure"; error: unknown };

/**
 * Thin wrapper around viem's multicall for heterogeneous contract arrays, where
 * full generic inference is more noise than signal. Always allowFailure.
 */
export async function multicall(
  client: PublicClient,
  contracts: unknown[],
): Promise<McResult[]> {
  return client.multicall({
    allowFailure: true,
    contracts: contracts as never,
  }) as unknown as Promise<McResult[]>;
}
