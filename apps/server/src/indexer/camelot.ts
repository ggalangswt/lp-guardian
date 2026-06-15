import { getAddress, type PublicClient } from "viem";
import type { ServerConfig } from "../config.js";
import { getChainClients } from "../chain/clients.js";
import {
  ARBITRUM_ADDRESSES,
  algebraFactoryAbi,
  algebraPoolAbi,
  algebraPositionManagerAbi,
  erc20Abi,
} from "../chain/abis.js";
import { amountsForLiquidity, toHuman } from "./lpMath.js";
import type { Protocol, RawToken, V3PositionRaw } from "./types.js";

const MAX_POSITIONS = 40;
const ZERO = "0x0000000000000000000000000000000000000000";

interface AlgebraPosition {
  tokenId: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

/**
 * Reads Camelot V3 (Algebra) positions for a wallet directly from Arbitrum via
 * RPC. Camelot uses dynamic fees, so there's no fee tier; the pool is resolved
 * per token pair via the Algebra factory. Best-effort: rejects on contract
 * shape mismatch so the aggregator can degrade gracefully.
 */
export async function fetchCamelotPositions(
  config: ServerConfig,
  owner: string,
): Promise<V3PositionRaw[]> {
  const { arbitrum } = getChainClients(config);
  const ownerAddr = getAddress(owner);
  const pm = ARBITRUM_ADDRESSES.camelotPositionManager as `0x${string}`;

  const balance = (await arbitrum.readContract({
    address: pm,
    abi: algebraPositionManagerAbi,
    functionName: "balanceOf",
    args: [ownerAddr],
  })) as bigint;

  const count = Math.min(Number(balance), MAX_POSITIONS);
  if (count === 0) return [];

  const tokenIds = await readTokenIds(arbitrum, pm, ownerAddr, count);
  const positions = await readPositions(arbitrum, pm, tokenIds);
  const active = positions.filter((p): p is AlgebraPosition =>
    Boolean(p && p.liquidity > 0n),
  );
  if (active.length === 0) return [];

  const pools = await resolvePools(arbitrum, active);
  const tokenMeta = await readTokenMeta(
    arbitrum,
    unique(active.flatMap((p) => [p.token0, p.token1])),
  );

  const out: V3PositionRaw[] = [];
  for (const p of active) {
    const poolKey = pairKey(p.token0, p.token1);
    const pool = pools.get(poolKey);
    if (!pool || pool.address === ZERO) continue;

    const t0 = tokenMeta.get(p.token0.toLowerCase());
    const t1 = tokenMeta.get(p.token1.toLowerCase());
    if (!t0 || !t1) continue;

    const amounts = amountsForLiquidity(
      p.liquidity,
      pool.tick,
      p.tickLower,
      p.tickUpper,
    );
    const isInRange = pool.tick >= p.tickLower && pool.tick < p.tickUpper;

    out.push({
      id: p.tokenId.toString(),
      owner: ownerAddr.toLowerCase(),
      liquidity: p.liquidity.toString(),
      depositedToken0: toHuman(amounts.amount0Raw, t0.decimals).toString(),
      depositedToken1: toHuman(amounts.amount1Raw, t1.decimals).toString(),
      collectedFeesToken0: toHuman(p.tokensOwed0, t0.decimals).toString(),
      collectedFeesToken1: toHuman(p.tokensOwed1, t1.decimals).toString(),
      tickLower: { tickIdx: p.tickLower.toString() },
      tickUpper: { tickIdx: p.tickUpper.toString() },
      pool: {
        id: pool.address.toLowerCase(),
        feeTier: pool.fee.toString(),
        tickSpacing: pool.tickSpacing.toString(),
        tick: pool.tick.toString(),
        token0: rawToken(p.token0, t0),
        token1: rawToken(p.token1, t1),
      },
      protocol: "camelot" satisfies Protocol,
      chainId: config.arbitrumChainId,
      isInRange,
    });
  }

  return out;
}

/**
 * Resolves a single Camelot (Algebra) position by tokenId directly from the
 * Camelot PositionManager — no owner enumeration needed. Returns null when the
 * tokenId isn't a live Camelot position (so the multi-protocol resolver can try
 * the next protocol).
 */
export async function resolveCamelotByTokenId(
  config: ServerConfig,
  tokenId: string,
): Promise<{ position: V3PositionRaw; owner: `0x${string}` } | null> {
  const { arbitrum } = getChainClients(config);
  const pm = ARBITRUM_ADDRESSES.camelotPositionManager as `0x${string}`;
  const id = BigInt(tokenId);

  const [posList, ownerRes] = await Promise.all([
    readPositions(arbitrum, pm, [id]),
    arbitrum
      .readContract({
        address: pm,
        abi: algebraPositionManagerAbi,
        functionName: "ownerOf",
        args: [id],
      })
      .catch(() => null),
  ]);
  const p = posList[0];
  if (!p || p.liquidity === 0n) return null;

  const pools = await resolvePools(arbitrum, [p]);
  const pool = pools.get(pairKey(p.token0, p.token1));
  if (!pool || pool.address === ZERO) return null;

  const tokenMeta = await readTokenMeta(arbitrum, unique([p.token0, p.token1]));
  const t0 = tokenMeta.get(p.token0.toLowerCase());
  const t1 = tokenMeta.get(p.token1.toLowerCase());
  if (!t0 || !t1) return null;

  const owner =
    typeof ownerRes === "string"
      ? getAddress(ownerRes)
      : (ZERO as `0x${string}`);
  const amounts = amountsForLiquidity(
    p.liquidity,
    pool.tick,
    p.tickLower,
    p.tickUpper,
  );
  const isInRange = pool.tick >= p.tickLower && pool.tick < p.tickUpper;

  const position: V3PositionRaw = {
    id: tokenId,
    owner: owner.toLowerCase(),
    liquidity: p.liquidity.toString(),
    depositedToken0: toHuman(amounts.amount0Raw, t0.decimals).toString(),
    depositedToken1: toHuman(amounts.amount1Raw, t1.decimals).toString(),
    collectedFeesToken0: toHuman(p.tokensOwed0, t0.decimals).toString(),
    collectedFeesToken1: toHuman(p.tokensOwed1, t1.decimals).toString(),
    tickLower: { tickIdx: p.tickLower.toString() },
    tickUpper: { tickIdx: p.tickUpper.toString() },
    pool: {
      id: pool.address.toLowerCase(),
      feeTier: pool.fee.toString(),
      tickSpacing: pool.tickSpacing.toString(),
      tick: pool.tick.toString(),
      token0: rawToken(p.token0, t0),
      token1: rawToken(p.token1, t1),
    },
    protocol: "camelot" satisfies Protocol,
    chainId: config.arbitrumChainId,
    isInRange,
  };
  return { position, owner };
}

async function readTokenIds(
  client: PublicClient,
  pm: `0x${string}`,
  owner: `0x${string}`,
  count: number,
): Promise<bigint[]> {
  const calls = Array.from({ length: count }, (_, i) => ({
    address: pm,
    abi: algebraPositionManagerAbi,
    functionName: "tokenOfOwnerByIndex" as const,
    args: [owner, BigInt(i)] as const,
  }));
  const res = await client.multicall({ contracts: calls, allowFailure: true });
  return res
    .filter((r) => r.status === "success")
    .map((r) => r.result as bigint);
}

async function readPositions(
  client: PublicClient,
  pm: `0x${string}`,
  tokenIds: bigint[],
): Promise<(AlgebraPosition | null)[]> {
  const calls = tokenIds.map((id) => ({
    address: pm,
    abi: algebraPositionManagerAbi,
    functionName: "positions" as const,
    args: [id] as const,
  }));
  const res = await client.multicall({ contracts: calls, allowFailure: true });
  return res.map((r, idx) => {
    if (r.status !== "success") return null;
    const t = r.result as readonly [
      bigint, `0x${string}`, `0x${string}`, `0x${string}`,
      number, number, bigint, bigint, bigint, bigint, bigint,
    ];
    return {
      tokenId: tokenIds[idx]!,
      token0: t[2],
      token1: t[3],
      tickLower: Number(t[4]),
      tickUpper: Number(t[5]),
      liquidity: t[6],
      tokensOwed0: t[9],
      tokensOwed1: t[10],
    } satisfies AlgebraPosition;
  });
}

interface AlgebraPoolState {
  address: `0x${string}`;
  tick: number;
  fee: number;
  tickSpacing: number;
}

async function resolvePools(
  client: PublicClient,
  positions: AlgebraPosition[],
): Promise<Map<string, AlgebraPoolState>> {
  const factory = ARBITRUM_ADDRESSES.camelotFactory as `0x${string}`;
  const keys = unique(positions.map((p) => pairKey(p.token0, p.token1)));
  const keyToPair = new Map<string, AlgebraPosition>();
  for (const p of positions) keyToPair.set(pairKey(p.token0, p.token1), p);

  const poolCalls = keys.map((k) => {
    const p = keyToPair.get(k)!;
    return {
      address: factory,
      abi: algebraFactoryAbi,
      functionName: "poolByPair" as const,
      args: [p.token0, p.token1] as const,
    };
  });
  const poolAddrs = await client.multicall({
    contracts: poolCalls,
    allowFailure: true,
  });

  const resolved: { key: string; address: `0x${string}` }[] = [];
  poolAddrs.forEach((r, i) => {
    if (r.status === "success" && r.result && r.result !== ZERO) {
      resolved.push({ key: keys[i]!, address: r.result as `0x${string}` });
    }
  });

  const stateCalls = resolved.flatMap(({ address }) => [
    { address, abi: algebraPoolAbi, functionName: "globalState" as const },
    { address, abi: algebraPoolAbi, functionName: "tickSpacing" as const },
  ]);
  const states = await client.multicall({
    contracts: stateCalls,
    allowFailure: true,
  });

  const out = new Map<string, AlgebraPoolState>();
  resolved.forEach(({ key, address }, i) => {
    const gs = states[i * 2];
    const spacing = states[i * 2 + 1];
    if (gs?.status !== "success") return;
    const g = gs.result as readonly unknown[];
    out.set(key, {
      address,
      tick: Number(g[1]),
      fee: Number(g[2]),
      tickSpacing: spacing?.status === "success" ? Number(spacing.result) : 60,
    });
  });
  return out;
}

async function readTokenMeta(
  client: PublicClient,
  tokens: `0x${string}`[],
): Promise<Map<string, { symbol: string; decimals: number }>> {
  const calls = tokens.flatMap((address) => [
    { address, abi: erc20Abi, functionName: "symbol" as const },
    { address, abi: erc20Abi, functionName: "decimals" as const },
  ]);
  const res = await client.multicall({ contracts: calls, allowFailure: true });
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

function rawToken(
  address: `0x${string}`,
  meta: { symbol: string; decimals: number },
): RawToken {
  return {
    id: address.toLowerCase(),
    symbol: meta.symbol,
    decimals: meta.decimals.toString(),
  };
}

function pairKey(token0: string, token1: string): string {
  return `${token0.toLowerCase()}-${token1.toLowerCase()}`;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
