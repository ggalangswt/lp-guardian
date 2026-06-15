import { getAddress } from "viem";
import type { ServerConfig } from "../config.js";
import { getChainClients } from "../chain/clients.js";
import { multicall } from "../chain/multicall.js";
import {
  ARBITRUM_ADDRESSES,
  erc20Abi,
  univ3FactoryAbi,
  univ3PoolAbi,
  univ3PositionManagerAbi,
} from "../chain/abis.js";
import { amountsForLiquidity, toHuman, uncollectedFees } from "./lpMath.js";
import { getMockArbitrumPositions } from "./mockArbitrum.js";
import { resolveCamelotByTokenId } from "./camelot.js";
import { resolveV4ByTokenId } from "./uniswapV4.js";
import type { Protocol, V3PositionRaw } from "./types.js";

export interface ResolvedPosition {
  position: V3PositionRaw;
  owner: `0x${string}`;
  source: "onchain" | "mock";
}

const ZERO = "0x0000000000000000000000000000000000000000";

/** Default protocol probe order when no hint is supplied. V3 first (cheapest,
 *  most common), then Camelot, then V4. */
const DEFAULT_ORDER: Protocol[] = ["uniswap-v3", "camelot", "uniswap-v4"];

/**
 * Resolves a single LP position by tokenId from Arbitrum One via RPC, across
 * Uniswap v3, Camelot (Algebra), and Uniswap v4. A `protocolHint` (passed by the
 * frontend from the position card) is tried first — important because the same
 * numeric tokenId can exist on multiple PMs. Falls back to a deterministic mock
 * when nothing resolves so the pipeline always runs.
 */
export async function resolvePositionByTokenId(
  config: ServerConfig,
  tokenId: string,
  protocolHint?: Protocol,
): Promise<ResolvedPosition> {
  const order =
    protocolHint && DEFAULT_ORDER.includes(protocolHint)
      ? [protocolHint, ...DEFAULT_ORDER.filter((p) => p !== protocolHint)]
      : DEFAULT_ORDER;

  for (const protocol of order) {
    try {
      if (protocol === "uniswap-v3") {
        const r = await resolveV3ByTokenId(config, tokenId);
        if (r) return r;
      } else if (protocol === "camelot") {
        const r = await resolveCamelotByTokenId(config, tokenId);
        if (r) return { ...r, source: "onchain" };
      } else if (protocol === "uniswap-v4") {
        const r = await resolveV4ByTokenId(config, tokenId);
        if (r) return { ...r, source: "onchain" };
      }
    } catch (err) {
      console.warn(
        `[resolvePosition] ${protocol} read failed for #${tokenId}: ${String(err)}`,
      );
    }
  }
  return mockResolved(tokenId);
}

async function resolveV3ByTokenId(
  config: ServerConfig,
  tokenId: string,
): Promise<ResolvedPosition | null> {
  const { arbitrum } = getChainClients(config);
  const pm = ARBITRUM_ADDRESSES.univ3PositionManager as `0x${string}`;
  const id = BigInt(tokenId);

  const [posRes, ownerRes] = await arbitrum.multicall({
    allowFailure: true,
    contracts: [
      { address: pm, abi: univ3PositionManagerAbi, functionName: "positions", args: [id] },
      { address: pm, abi: univ3PositionManagerAbi, functionName: "ownerOf", args: [id] },
    ],
  });
  if (posRes.status !== "success") return null;

  const t = posRes.result as readonly [
    bigint, `0x${string}`, `0x${string}`, `0x${string}`, number,
    number, number, bigint, bigint, bigint, bigint, bigint,
  ];
  const token0 = t[2];
  const token1 = t[3];
  const fee = Number(t[4]);
  const tickLower = Number(t[5]);
  const tickUpper = Number(t[6]);
  const liquidity = t[7];
  if (token0 === ZERO || liquidity === 0n) return null;

  const owner =
    ownerRes.status === "success"
      ? getAddress(ownerRes.result as `0x${string}`)
      : (ZERO as `0x${string}`);

  const poolAddr = (await arbitrum.readContract({
    address: ARBITRUM_ADDRESSES.univ3Factory as `0x${string}`,
    abi: univ3FactoryAbi,
    functionName: "getPool",
    args: [token0, token1, fee],
  })) as `0x${string}`;
  if (poolAddr === ZERO) return null;

  const [slot0, spacing, fg0, fg1, tickLo, tickHi, sym0, dec0, sym1, dec1] =
    await multicall(arbitrum, [
      { address: poolAddr, abi: univ3PoolAbi, functionName: "slot0" },
      { address: poolAddr, abi: univ3PoolAbi, functionName: "tickSpacing" },
      { address: poolAddr, abi: univ3PoolAbi, functionName: "feeGrowthGlobal0X128" },
      { address: poolAddr, abi: univ3PoolAbi, functionName: "feeGrowthGlobal1X128" },
      { address: poolAddr, abi: univ3PoolAbi, functionName: "ticks", args: [tickLower] },
      { address: poolAddr, abi: univ3PoolAbi, functionName: "ticks", args: [tickUpper] },
      { address: token0, abi: erc20Abi, functionName: "symbol" },
      { address: token0, abi: erc20Abi, functionName: "decimals" },
      { address: token1, abi: erc20Abi, functionName: "symbol" },
      { address: token1, abi: erc20Abi, functionName: "decimals" },
    ]);

  if (!slot0 || slot0.status !== "success") return null;
  const currentTick = Number((slot0.result as readonly unknown[])[1]);
  const decimals0 = dec0.status === "success" ? Number(dec0.result) : 18;
  const decimals1 = dec1.status === "success" ? Number(dec1.result) : 18;
  const symbol0 = sym0.status === "success" ? (sym0.result as string) : "?";
  const symbol1 = sym1.status === "success" ? (sym1.result as string) : "?";

  const amounts = amountsForLiquidity(liquidity, currentTick, tickLower, tickUpper);

  let fees0 = 0;
  let fees1 = 0;
  if (
    tickLo.status === "success" &&
    tickHi.status === "success" &&
    fg0.status === "success" &&
    fg1.status === "success"
  ) {
    const lo = tickLo.result as readonly unknown[];
    const hi = tickHi.result as readonly unknown[];
    const { fees0Raw, fees1Raw } = uncollectedFees({
      feeGrowthGlobal0X128: fg0.result as bigint,
      feeGrowthGlobal1X128: fg1.result as bigint,
      lowerFeeGrowthOutside0X128: lo[2] as bigint,
      lowerFeeGrowthOutside1X128: lo[3] as bigint,
      upperFeeGrowthOutside0X128: hi[2] as bigint,
      upperFeeGrowthOutside1X128: hi[3] as bigint,
      feeGrowthInside0LastX128: t[8],
      feeGrowthInside1LastX128: t[9],
      tokensOwed0: t[10],
      tokensOwed1: t[11],
      liquidity,
      tickCurrent: currentTick,
      tickLower,
      tickUpper,
    });
    fees0 = toHuman(fees0Raw, decimals0);
    fees1 = toHuman(fees1Raw, decimals1);
  }

  const isInRange = currentTick >= tickLower && currentTick < tickUpper;

  const position: V3PositionRaw = {
    id: tokenId,
    owner: owner.toLowerCase(),
    liquidity: liquidity.toString(),
    depositedToken0: toHuman(amounts.amount0Raw, decimals0).toString(),
    depositedToken1: toHuman(amounts.amount1Raw, decimals1).toString(),
    collectedFeesToken0: fees0.toString(),
    collectedFeesToken1: fees1.toString(),
    tickLower: { tickIdx: tickLower.toString() },
    tickUpper: { tickIdx: tickUpper.toString() },
    pool: {
      id: poolAddr.toLowerCase(),
      feeTier: fee.toString(),
      tickSpacing:
        spacing.status === "success" ? Number(spacing.result).toString() : "0",
      tick: currentTick.toString(),
      token0: { id: token0.toLowerCase(), symbol: symbol0, decimals: decimals0.toString() },
      token1: { id: token1.toLowerCase(), symbol: symbol1, decimals: decimals1.toString() },
    },
    protocol: "uniswap-v3",
    chainId: config.arbitrumChainId,
    isInRange,
  };

  return { position, owner, source: "onchain" };
}

function mockResolved(tokenId: string): ResolvedPosition {
  const mocks = getMockArbitrumPositions(
    "0x000000000000000000000000000000000000dead",
  );
  const base = mocks.find((p) => p.id === tokenId) ?? mocks[0]!;
  const position: V3PositionRaw = { ...base, id: tokenId };
  return {
    position,
    owner: "0x000000000000000000000000000000000000dead",
    source: "mock",
  };
}
