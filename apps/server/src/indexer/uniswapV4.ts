import {
  encodeAbiParameters,
  getAddress,
  keccak256,
  type PublicClient,
} from "viem";
import type { ServerConfig } from "../config.js";
import { getChainClients } from "../chain/clients.js";
import { multicall } from "../chain/multicall.js";
import {
  ARBITRUM_ADDRESSES,
  erc20Abi,
  v4PositionManagerAbi,
  v4StateViewAbi,
} from "../chain/abis.js";
import { querySubgraph } from "../services/subgraph/graphClient.js";
import { amountsForLiquidity, toHuman } from "./lpMath.js";
import type { Protocol, RawToken, V3PositionRaw } from "./types.js";

const ZERO = "0x0000000000000000000000000000000000000000";
const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1"; // Arbitrum WETH
const MAX_POSITIONS = 50;

interface V4PoolKey {
  currency0: `0x${string}`;
  currency1: `0x${string}`;
  fee: number;
  tickSpacing: number;
  hooks: `0x${string}`;
}

interface V4Position {
  tokenId: bigint;
  liquidity: bigint;
  poolKey: V4PoolKey;
  tickLower: number;
  tickUpper: number;
  poolId: `0x${string}`;
}

interface SubgraphPositions {
  positions: { tokenId: string }[];
}

const POSITIONS_BY_OWNER = /* GraphQL */ `
  query V4PosByOwner($owner: String!, $first: Int!) {
    positions(where: { owner: $owner }, first: $first, orderBy: createdAtTimestamp, orderDirection: desc) {
      tokenId
    }
  }
`;

/**
 * Indexes a wallet's Uniswap V4 positions on Arbitrum. V4 splits the data: the
 * subgraph enumerates the wallet's position NFTs (tokenIds), and the actual
 * liquidity/range/pool is read on-chain from the PositionManager + StateView
 * (singleton PoolManager). Returns the subgraph-compatible wire shape.
 */
export async function fetchUniswapV4Positions(
  config: ServerConfig,
  owner: string,
): Promise<V3PositionRaw[]> {
  if (!config.theGraphKey || !config.uniswapV4SubgraphId) return [];

  const ownerAddr = getAddress(owner);
  const sub = await querySubgraph<SubgraphPositions>(
    config,
    config.uniswapV4SubgraphId,
    POSITIONS_BY_OWNER,
    { owner: ownerAddr.toLowerCase(), first: MAX_POSITIONS },
  );
  const tokenIds = (sub?.positions ?? []).map((p) => BigInt(p.tokenId));
  if (tokenIds.length === 0) return [];

  const { arbitrum } = getChainClients(config);
  const posm = ARBITRUM_ADDRESSES.v4PositionManager as `0x${string}`;

  const active = await readActivePositions(arbitrum, posm, tokenIds);
  if (active.length === 0) return [];

  // Current tick per unique pool, via StateView.getSlot0.
  const tickByPool = await readPoolTicks(arbitrum, active);

  // Token metadata (skip native ETH which is address(0)).
  const tokenMeta = await readTokenMeta(
    arbitrum,
    unique(
      active.flatMap((p) => [p.poolKey.currency0, p.poolKey.currency1]),
    ).filter((a) => a.toLowerCase() !== ZERO),
  );

  const out: V3PositionRaw[] = [];
  for (const p of active) {
    const tick = tickByPool.get(p.poolId);
    if (tick === undefined) continue;

    const t0 = tokenInfo(p.poolKey.currency0, tokenMeta);
    const t1 = tokenInfo(p.poolKey.currency1, tokenMeta);

    const amounts = amountsForLiquidity(
      p.liquidity,
      tick,
      p.tickLower,
      p.tickUpper,
    );
    const isInRange = tick >= p.tickLower && tick < p.tickUpper;

    out.push({
      id: p.tokenId.toString(),
      owner: ownerAddr.toLowerCase(),
      liquidity: p.liquidity.toString(),
      depositedToken0: toHuman(amounts.amount0Raw, t0.decimals).toString(),
      depositedToken1: toHuman(amounts.amount1Raw, t1.decimals).toString(),
      // V4 uncollected fees need feeGrowthInside accounting — deferred for now.
      collectedFeesToken0: "0",
      collectedFeesToken1: "0",
      tickLower: { tickIdx: p.tickLower.toString() },
      tickUpper: { tickIdx: p.tickUpper.toString() },
      pool: {
        id: p.poolId.toLowerCase(),
        feeTier: p.poolKey.fee.toString(),
        tickSpacing: p.poolKey.tickSpacing.toString(),
        tick: tick.toString(),
        token0: rawToken(t0),
        token1: rawToken(t1),
      },
      protocol: "uniswap-v4" satisfies Protocol,
      chainId: config.arbitrumChainId,
      isInRange,
    });
  }

  return out;
}

/**
 * Resolves a single Uniswap V4 position by tokenId directly from the
 * PositionManager + StateView — no subgraph needed (we already have the
 * tokenId). Returns null when it isn't a live V4 position.
 */
export async function resolveV4ByTokenId(
  config: ServerConfig,
  tokenId: string,
): Promise<{ position: V3PositionRaw; owner: `0x${string}` } | null> {
  const { arbitrum } = getChainClients(config);
  const posm = ARBITRUM_ADDRESSES.v4PositionManager as `0x${string}`;
  const id = BigInt(tokenId);

  const active = await readActivePositions(arbitrum, posm, [id]);
  const p = active[0];
  if (!p) return null;

  const tickByPool = await readPoolTicks(arbitrum, [p]);
  const tick = tickByPool.get(p.poolId);
  if (tick === undefined) return null;

  const ownerRes = await arbitrum
    .readContract({
      address: posm,
      abi: v4PositionManagerAbi,
      functionName: "ownerOf",
      args: [id],
    })
    .catch(() => null);
  const owner =
    typeof ownerRes === "string"
      ? getAddress(ownerRes)
      : (ZERO as `0x${string}`);

  const tokenMeta = await readTokenMeta(
    arbitrum,
    unique([p.poolKey.currency0, p.poolKey.currency1]).filter(
      (a) => a.toLowerCase() !== ZERO,
    ),
  );
  const t0 = tokenInfo(p.poolKey.currency0, tokenMeta);
  const t1 = tokenInfo(p.poolKey.currency1, tokenMeta);
  const amounts = amountsForLiquidity(p.liquidity, tick, p.tickLower, p.tickUpper);
  const isInRange = tick >= p.tickLower && tick < p.tickUpper;

  const position: V3PositionRaw = {
    id: tokenId,
    owner: owner.toLowerCase(),
    liquidity: p.liquidity.toString(),
    depositedToken0: toHuman(amounts.amount0Raw, t0.decimals).toString(),
    depositedToken1: toHuman(amounts.amount1Raw, t1.decimals).toString(),
    collectedFeesToken0: "0",
    collectedFeesToken1: "0",
    tickLower: { tickIdx: p.tickLower.toString() },
    tickUpper: { tickIdx: p.tickUpper.toString() },
    pool: {
      id: p.poolId.toLowerCase(),
      feeTier: p.poolKey.fee.toString(),
      tickSpacing: p.poolKey.tickSpacing.toString(),
      tick: tick.toString(),
      token0: rawToken(t0),
      token1: rawToken(t1),
    },
    protocol: "uniswap-v4" satisfies Protocol,
    chainId: config.arbitrumChainId,
    isInRange,
  };
  return { position, owner };
}

async function readActivePositions(
  client: PublicClient,
  posm: `0x${string}`,
  tokenIds: bigint[],
): Promise<V4Position[]> {
  // 1. liquidity per tokenId → keep active ones
  const liqRes = await multicall(
    client,
    tokenIds.map((id) => ({
      address: posm,
      abi: v4PositionManagerAbi,
      functionName: "getPositionLiquidity",
      args: [id],
    })),
  );
  const liveIds: { tokenId: bigint; liquidity: bigint }[] = [];
  liqRes.forEach((r, i) => {
    if (r.status === "success" && (r.result as bigint) > 0n) {
      liveIds.push({ tokenId: tokenIds[i]!, liquidity: r.result as bigint });
    }
  });
  if (liveIds.length === 0) return [];

  // 2. poolKey + packed info per active tokenId
  const infoRes = await multicall(
    client,
    liveIds.map(({ tokenId }) => ({
      address: posm,
      abi: v4PositionManagerAbi,
      functionName: "getPoolAndPositionInfo",
      args: [tokenId],
    })),
  );

  const out: V4Position[] = [];
  infoRes.forEach((r, i) => {
    if (r.status !== "success") return;
    const [poolKey, info] = r.result as [V4PoolKey, bigint];
    out.push({
      tokenId: liveIds[i]!.tokenId,
      liquidity: liveIds[i]!.liquidity,
      poolKey,
      // PositionInfo packing: poolId(200) | tickUpper(24) | tickLower(24) | hasSubscriber(8)
      tickLower: Number(BigInt.asIntN(24, (info >> 8n) & 0xffffffn)),
      tickUpper: Number(BigInt.asIntN(24, (info >> 32n) & 0xffffffn)),
      poolId: computePoolId(poolKey),
    });
  });
  return out;
}

async function readPoolTicks(
  client: PublicClient,
  positions: V4Position[],
): Promise<Map<string, number>> {
  const stateView = ARBITRUM_ADDRESSES.v4StateView as `0x${string}`;
  const poolIds = unique(positions.map((p) => p.poolId));
  const res = await multicall(
    client,
    poolIds.map((poolId) => ({
      address: stateView,
      abi: v4StateViewAbi,
      functionName: "getSlot0",
      args: [poolId],
    })),
  );
  const out = new Map<string, number>();
  res.forEach((r, i) => {
    if (r.status !== "success") return;
    const slot0 = r.result as readonly unknown[];
    out.set(poolIds[i]!, Number(slot0[1]));
  });
  return out;
}

function computePoolId(k: V4PoolKey): `0x${string}` {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "address" },
        { type: "address" },
        { type: "uint24" },
        { type: "int24" },
        { type: "address" },
      ],
      [k.currency0, k.currency1, k.fee, k.tickSpacing, k.hooks],
    ),
  );
}

interface TokenInfo {
  id: string;
  symbol: string;
  decimals: number;
}

/** Resolves token metadata, mapping native ETH (address(0)) → WETH/ETH. */
function tokenInfo(
  currency: `0x${string}`,
  meta: Map<string, { symbol: string; decimals: number }>,
): TokenInfo {
  if (currency.toLowerCase() === ZERO) {
    return { id: WETH, symbol: "ETH", decimals: 18 };
  }
  const m = meta.get(currency.toLowerCase());
  return {
    id: currency.toLowerCase(),
    symbol: m?.symbol ?? "?",
    decimals: m?.decimals ?? 18,
  };
}

function rawToken(t: TokenInfo): RawToken {
  return { id: t.id, symbol: t.symbol, decimals: t.decimals.toString() };
}

async function readTokenMeta(
  client: PublicClient,
  tokens: `0x${string}`[],
): Promise<Map<string, { symbol: string; decimals: number }>> {
  if (tokens.length === 0) return new Map();
  const res = await multicall(
    client,
    tokens.flatMap((address) => [
      { address, abi: erc20Abi, functionName: "symbol" },
      { address, abi: erc20Abi, functionName: "decimals" },
    ]),
  );
  const out = new Map<string, { symbol: string; decimals: number }>();
  tokens.forEach((address, i) => {
    const sym = res[i * 2];
    const dec = res[i * 2 + 1];
    out.set(address.toLowerCase(), {
      symbol: sym?.status === "success" ? (sym.result as string) : "?",
      decimals: dec?.status === "success" ? Number(dec.result) : 18,
    });
  });
  return out;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
