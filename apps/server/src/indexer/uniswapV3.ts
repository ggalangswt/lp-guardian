import { getAddress, type PublicClient } from "viem";
import type { ServerConfig } from "../config.js";
import { getChainClients } from "../chain/clients.js";
import {
  ARBITRUM_ADDRESSES,
  erc20Abi,
  univ3FactoryAbi,
  univ3PoolAbi,
  univ3PositionManagerAbi,
} from "../chain/abis.js";
import { multicall } from "../chain/multicall.js";
import { amountsForLiquidity, toHuman, uncollectedFees } from "./lpMath.js";
import type { Protocol, RawToken, V3PositionRaw } from "./types.js";

const MAX_POSITIONS = 40;

interface RawPosition {
  tokenId: bigint;
  token0: `0x${string}`;
  token1: `0x${string}`;
  fee: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  feeGrowthInside0LastX128: bigint;
  feeGrowthInside1LastX128: bigint;
  tokensOwed0: bigint;
  tokensOwed1: bigint;
}

interface PoolState {
  address: `0x${string}`;
  tick: number;
  tickSpacing: number;
  feeGrowthGlobal0X128: bigint;
  feeGrowthGlobal1X128: bigint;
}

interface TickState {
  feeGrowthOutside0X128: bigint;
  feeGrowthOutside1X128: bigint;
}

/**
 * Reads a wallet's Uniswap v3 positions directly from Arbitrum One via RPC —
 * no subgraph / API key required. Returns the subgraph-compatible wire shape.
 */
export async function fetchUniswapV3Positions(
  config: ServerConfig,
  owner: string,
): Promise<V3PositionRaw[]> {
  const { arbitrum } = getChainClients(config);
  const ownerAddr = getAddress(owner);
  const pm = ARBITRUM_ADDRESSES.univ3PositionManager as `0x${string}`;

  const balance = (await arbitrum.readContract({
    address: pm,
    abi: univ3PositionManagerAbi,
    functionName: "balanceOf",
    args: [ownerAddr],
  })) as bigint;

  const count = Math.min(Number(balance), MAX_POSITIONS);
  if (count === 0) return [];

  // 1. tokenIds
  const tokenIds = await readTokenIds(arbitrum, pm, ownerAddr, count);

  // 2. raw positions
  const raws = await readPositions(arbitrum, pm, tokenIds);
  const active = raws.filter((p) => p && p.liquidity > 0n) as RawPosition[];
  if (active.length === 0) return [];

  // 3. resolve pools (dedup by token0/token1/fee)
  const pools = await resolvePools(config, arbitrum, active);

  // 4. token metadata (dedup)
  const tokenMeta = await readTokenMeta(
    arbitrum,
    unique(active.flatMap((p) => [p.token0, p.token1])),
  );

  // 5. tick feeGrowth for each position's bounds
  const tickStates = await readTickStates(arbitrum, active, pools);

  // 6. assemble
  const out: V3PositionRaw[] = [];
  for (const p of active) {
    const poolKey = poolKeyOf(p.token0, p.token1, p.fee);
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

    const lower = tickStates.get(`${poolKey}:${p.tickLower}`);
    const upper = tickStates.get(`${poolKey}:${p.tickUpper}`);
    let fees0 = 0;
    let fees1 = 0;
    if (lower && upper) {
      const { fees0Raw, fees1Raw } = uncollectedFees({
        feeGrowthGlobal0X128: pool.feeGrowthGlobal0X128,
        feeGrowthGlobal1X128: pool.feeGrowthGlobal1X128,
        lowerFeeGrowthOutside0X128: lower.feeGrowthOutside0X128,
        lowerFeeGrowthOutside1X128: lower.feeGrowthOutside1X128,
        upperFeeGrowthOutside0X128: upper.feeGrowthOutside0X128,
        upperFeeGrowthOutside1X128: upper.feeGrowthOutside1X128,
        feeGrowthInside0LastX128: p.feeGrowthInside0LastX128,
        feeGrowthInside1LastX128: p.feeGrowthInside1LastX128,
        tokensOwed0: p.tokensOwed0,
        tokensOwed1: p.tokensOwed1,
        liquidity: p.liquidity,
        tickCurrent: pool.tick,
        tickLower: p.tickLower,
        tickUpper: p.tickUpper,
      });
      fees0 = toHuman(fees0Raw, t0.decimals);
      fees1 = toHuman(fees1Raw, t1.decimals);
    }

    const isInRange = pool.tick >= p.tickLower && pool.tick < p.tickUpper;

    out.push({
      id: p.tokenId.toString(),
      owner: ownerAddr.toLowerCase(),
      liquidity: p.liquidity.toString(),
      depositedToken0: toHuman(amounts.amount0Raw, t0.decimals).toString(),
      depositedToken1: toHuman(amounts.amount1Raw, t1.decimals).toString(),
      collectedFeesToken0: fees0.toString(),
      collectedFeesToken1: fees1.toString(),
      tickLower: { tickIdx: p.tickLower.toString() },
      tickUpper: { tickIdx: p.tickUpper.toString() },
      pool: {
        id: pool.address.toLowerCase(),
        feeTier: p.fee.toString(),
        tickSpacing: pool.tickSpacing.toString(),
        tick: pool.tick.toString(),
        token0: rawToken(p.token0, t0),
        token1: rawToken(p.token1, t1),
      },
      protocol: "uniswap-v3" satisfies Protocol,
      chainId: config.arbitrumChainId,
      isInRange,
    });
  }

  return out;
}

const ZERO = "0x0000000000000000000000000000000000000000";

async function readTokenIds(
  client: PublicClient,
  pm: `0x${string}`,
  owner: `0x${string}`,
  count: number,
): Promise<bigint[]> {
  const calls = Array.from({ length: count }, (_, i) => ({
    address: pm,
    abi: univ3PositionManagerAbi,
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
): Promise<(RawPosition | null)[]> {
  const calls = tokenIds.map((id) => ({
    address: pm,
    abi: univ3PositionManagerAbi,
    functionName: "positions" as const,
    args: [id] as const,
  }));
  const res = await client.multicall({ contracts: calls, allowFailure: true });
  return res.map((r, idx) => {
    if (r.status !== "success") return null;
    const t = r.result as readonly [
      bigint, `0x${string}`, `0x${string}`, `0x${string}`, number,
      number, number, bigint, bigint, bigint, bigint, bigint,
    ];
    return {
      tokenId: tokenIds[idx]!,
      token0: t[2],
      token1: t[3],
      fee: Number(t[4]),
      tickLower: Number(t[5]),
      tickUpper: Number(t[6]),
      liquidity: t[7],
      feeGrowthInside0LastX128: t[8],
      feeGrowthInside1LastX128: t[9],
      tokensOwed0: t[10],
      tokensOwed1: t[11],
    } satisfies RawPosition;
  });
}

async function resolvePools(
  config: ServerConfig,
  client: PublicClient,
  positions: RawPosition[],
): Promise<Map<string, PoolState>> {
  const factory = ARBITRUM_ADDRESSES.univ3Factory as `0x${string}`;
  const keys = unique(
    positions.map((p) => poolKeyOf(p.token0, p.token1, p.fee)),
  );
  const keyToTriple = new Map<string, RawPosition>();
  for (const p of positions) keyToTriple.set(poolKeyOf(p.token0, p.token1, p.fee), p);

  // getPool for each unique key
  const getPoolCalls = keys.map((k) => {
    const p = keyToTriple.get(k)!;
    return {
      address: factory,
      abi: univ3FactoryAbi,
      functionName: "getPool" as const,
      args: [p.token0, p.token1, p.fee] as const,
    };
  });
  const poolAddrs = await client.multicall({
    contracts: getPoolCalls,
    allowFailure: true,
  });

  const resolved: { key: string; address: `0x${string}` }[] = [];
  poolAddrs.forEach((r, i) => {
    if (r.status === "success" && r.result && r.result !== ZERO) {
      resolved.push({ key: keys[i]!, address: r.result as `0x${string}` });
    }
  });

  // slot0 / tickSpacing / feeGrowthGlobal for each resolved pool
  const stateCalls = resolved.flatMap(({ address }) => [
    { address, abi: univ3PoolAbi, functionName: "slot0" as const },
    { address, abi: univ3PoolAbi, functionName: "tickSpacing" as const },
    { address, abi: univ3PoolAbi, functionName: "feeGrowthGlobal0X128" as const },
    { address, abi: univ3PoolAbi, functionName: "feeGrowthGlobal1X128" as const },
  ]);
  const states = await client.multicall({
    contracts: stateCalls,
    allowFailure: true,
  });

  const out = new Map<string, PoolState>();
  resolved.forEach(({ key, address }, i) => {
    const base = i * 4;
    const slot0 = states[base];
    const spacing = states[base + 1];
    const fg0 = states[base + 2];
    const fg1 = states[base + 3];
    if (slot0?.status !== "success") return;
    const tick = Number((slot0.result as readonly unknown[])[1]);
    out.set(key, {
      address,
      tick,
      tickSpacing:
        spacing?.status === "success" ? Number(spacing.result) : 0,
      feeGrowthGlobal0X128:
        fg0?.status === "success" ? (fg0.result as bigint) : 0n,
      feeGrowthGlobal1X128:
        fg1?.status === "success" ? (fg1.result as bigint) : 0n,
    });
  });
  void config;
  return out;
}

async function readTickStates(
  client: PublicClient,
  positions: RawPosition[],
  pools: Map<string, PoolState>,
): Promise<Map<string, TickState>> {
  const calls: { key: string; contract: Record<string, unknown> }[] = [];
  for (const p of positions) {
    const poolKey = poolKeyOf(p.token0, p.token1, p.fee);
    const pool = pools.get(poolKey);
    if (!pool) continue;
    for (const tick of [p.tickLower, p.tickUpper]) {
      calls.push({
        key: `${poolKey}:${tick}`,
        contract: {
          address: pool.address,
          abi: univ3PoolAbi,
          functionName: "ticks",
          args: [tick],
        },
      });
    }
  }
  if (calls.length === 0) return new Map();

  const res = await multicall(
    client,
    calls.map((c) => c.contract),
  );

  const out = new Map<string, TickState>();
  res.forEach((r, i) => {
    if (r.status !== "success") return;
    const t = r.result as readonly unknown[];
    out.set(calls[i]!.key, {
      feeGrowthOutside0X128: t[2] as bigint,
      feeGrowthOutside1X128: t[3] as bigint,
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

function poolKeyOf(token0: string, token1: string, fee: number): string {
  return `${token0.toLowerCase()}-${token1.toLowerCase()}-${fee}`;
}

function unique<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}
