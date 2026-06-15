import type { ServerConfig } from "../../config.js";
import { querySubgraph } from "../../services/subgraph/graphClient.js";
import { decodeHookAddress } from "./v4Flags.js";
import type { HookCandidate, HookDiscoveryResult } from "./hookDiscovery.js";

const ZERO = "0x0000000000000000000000000000000000000000";

// Uniswap V4 represents native ETH as address(0). Positions hold WETH, so map
// known WETH addresses → native ETH when querying V4 pools.
const WETH_ADDRESSES = new Set<string>([
  "0x82af49447d8a07e3bd95bd0d56f35241523fbab1", // Arbitrum WETH
  "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2", // Mainnet WETH
]);

function toV4Token(address: string): string {
  const a = address.toLowerCase();
  return WETH_ADDRESSES.has(a) ? ZERO : a;
}

// Uniswap V4 subgraph `Pool` shape (subset). Field names follow the standard
// Uniswap subgraph conventions; verified against a live query key.
interface V4PoolRow {
  id: string;
  hooks: string;
  feeTier: string;
  tickSpacing: string;
  totalValueLockedUSD: string;
  volumeUSD: string;
  token0: { id: string; symbol: string; decimals: string };
  token1: { id: string; symbol: string; decimals: string };
}

interface V4PoolsResponse {
  pools: V4PoolRow[];
}

const QUERY = /* GraphQL */ `
  query V4Hooks($token0: String!, $token1: String!, $zero: String!) {
    pools(
      where: { token0: $token0, token1: $token1, hooks_not: $zero }
      orderBy: totalValueLockedUSD
      orderDirection: desc
      first: 5
    ) {
      id
      hooks
      feeTier
      tickSpacing
      totalValueLockedUSD
      volumeUSD
      token0 { id symbol decimals }
      token1 { id symbol decimals }
    }
  }
`;

/**
 * Discovers real Uniswap V4 pools (with hooks) for a token pair via the V4
 * subgraph, decoding each hook's permission flags from its address. Returns null
 * when no key / subgraph id is configured or nothing is found, so the caller can
 * fall back to the heuristic discovery.
 */
export async function discoverHooksFromSubgraph(
  config: ServerConfig,
  token0: string,
  token1: string,
  pair: string,
): Promise<HookDiscoveryResult | null> {
  if (!config.theGraphKey || !config.uniswapV4SubgraphId) return null;

  // Map WETH → native ETH, then order token0 < token1 by address (Uniswap rule).
  const [a, b] = [toV4Token(token0), toV4Token(token1)].sort();

  const data = await querySubgraph<V4PoolsResponse>(
    config,
    config.uniswapV4SubgraphId,
    QUERY,
    { token0: a, token1: b, zero: ZERO },
  );
  if (!data || !data.pools || data.pools.length === 0) return null;

  const candidates: HookCandidate[] = data.pools
    .filter((p) => p.hooks && p.hooks !== ZERO)
    .map((p) => {
      const decoded = decodeHookAddress(p.hooks);
      return {
        poolId: p.id,
        hookAddress: p.hooks,
        family: decoded.family,
        flagsBitmap: decoded.flagsBitmap,
        activeFlags: decoded.activeFlags,
        feeTier: Number(p.feeTier),
        tickSpacing: Number(p.tickSpacing),
        tvlUsd: Number(p.totalValueLockedUSD),
        volumeUsd: Number(p.volumeUSD),
        pair,
      } satisfies HookCandidate;
    });

  if (candidates.length === 0) return null;

  return {
    candidates,
    topFamily: candidates[0]!.family,
    count: candidates.length,
  };
}
