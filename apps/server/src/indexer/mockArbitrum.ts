import type { Protocol, V3PositionRaw } from "./types.js";

// Real Arbitrum One token addresses so downstream USD enrichment resolves.
const WETH = "0x82af49447d8a07e3bd95bd0d56f35241523fbab1";
const USDC = "0xaf88d065e77c8cc2239327c5edb3a432268e5831";
const ARB  = "0x912ce59144191c1204e64559fe8253a0e49e6548";
const WBTC = "0x2f2a2543b76a4166549f7aab2e75bef0aefc5b0f";
const LINK = "0xf97f4df75117a78c1a5a0dbb814af92458539fb4";
const USDT = "0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9";

const CHAIN_ID = 42161;

// Known demo wallets (lowercase). These get wallet-specific cartridges.
const DEMO_WALLETS: Record<string, string> = {
  "0xfd235968e65b0990584585763f837a5b5330e6de": "portfolio",
  "0x8f4daa33706d70677fd69e4e0d47e595bc820e95": "bleeding",
  "0x4d3e3d1a38505185ba86a1b1f3084195d556bc2a": "mixed",
  "0x4b296808f414ab3775889fa2863e1d73f958a58e": "whale",
  "0x90deceec188094f6f6c1ef446d843f70abfc92cb": "healthy",
  "0x7c6ef14f6890d0fda17fb8e4fb6f649f0355c3be": "drifting",
};

// Pool token descriptors
const T_WETH = { id: WETH, symbol: "WETH", decimals: "18" };
const T_USDC = { id: USDC, symbol: "USDC", decimals: "6" };
const T_ARB  = { id: ARB,  symbol: "ARB",  decimals: "18" };
const T_WBTC = { id: WBTC, symbol: "WBTC", decimals: "8" };
const T_LINK = { id: LINK, symbol: "LINK", decimals: "18" };
const T_USDT = { id: USDT, symbol: "USDT", decimals: "6" };

// Pool configs
const POOL_WETH_USDC_005 = {
  id: "0xc31e54c7a869b9fcbecc14363cf510d1c41fa443",
  feeTier: "500", tickSpacing: "10",
  token0: T_WETH, token1: T_USDC,
};
const POOL_WETH_USDC_030 = {
  id: "0x17c14d2c404d167802b16c450d3c99f88f2c4f4c",
  feeTier: "3000", tickSpacing: "60",
  token0: T_WETH, token1: T_USDC,
};
const POOL_ARB_WETH = {
  id: "0xe51635ae8136abaed197c1ec4c065e5c5dccfce",
  feeTier: "3000", tickSpacing: "60",
  token0: T_ARB, token1: T_WETH,
};
const POOL_WBTC_WETH = {
  id: "0x2f5e87c9312fa29aed5c179e456625d79015299c",
  feeTier: "500", tickSpacing: "10",
  token0: T_WBTC, token1: T_WETH,
};
const POOL_LINK_WETH = {
  id: "0x468b88941e7cc0b88c1869d68ab6b570652e697f",
  feeTier: "3000", tickSpacing: "60",
  token0: T_LINK, token1: T_WETH,
};
const POOL_USDC_USDT = {
  id: "0xbe3ad6a5669dc0b8b12febc03608860c31e2eef6",
  feeTier: "100", tickSpacing: "1",
  token0: T_USDC, token1: T_USDT,
};

// WETH/USDC tick benchmarks (~$3,400/ETH)
const WETH_USDC_IN_RANGE = -200_100; // pool at $3,400
const WETH_USDC_DRIFTING = -199_200; // near tickUpper edge
const WETH_USDC_OOR_UP   = -197_800; // price rose to ~$4,100 — all OOR
const RANGE_NORMAL: [number, number] = [-201_200, -199_000];

interface PoolConfig {
  id: string;
  feeTier: string;
  tickSpacing: string;
  token0: { id: string; symbol: string; decimals: string };
  token1: { id: string; symbol: string; decimals: string };
}

function pos(
  owner: string,
  id: string,
  pool: PoolConfig,
  tickLower: number,
  tickUpper: number,
  poolTick: number,
  dep0: string,
  dep1: string,
  f0: string,
  f1: string,
  protocol: Protocol,
): V3PositionRaw {
  return {
    id,
    owner: owner.toLowerCase(),
    liquidity: `${BigInt(id.replace(/\D/g, "")) * 100_000_000n}`,
    depositedToken0: dep0,
    depositedToken1: dep1,
    collectedFeesToken0: f0,
    collectedFeesToken1: f1,
    tickLower: { tickIdx: tickLower.toString() },
    tickUpper: { tickIdx: tickUpper.toString() },
    pool: {
      id: pool.id,
      feeTier: pool.feeTier,
      tickSpacing: pool.tickSpacing,
      tick: poolTick.toString(),
      token0: pool.token0,
      token1: pool.token1,
    },
    protocol,
    chainId: CHAIN_ID,
    isInRange: poolTick >= tickLower && poolTick < tickUpper,
  };
}

// ─── Wallet cartridges ────────────────────────────────────────────────────

function cartridgeBleeding(owner: string): V3PositionRaw[] {
  // 10 USDC/WETH positions, all out-of-range (~$600k stuck)
  return Array.from({ length: 10 }, (_, i) =>
    pos(owner, `805310${i}`, POOL_WETH_USDC_005,
      RANGE_NORMAL[0], RANGE_NORMAL[1], WETH_USDC_OOR_UP,
      "0", (58000 + i * 2200).toFixed(0),
      "0", "0", "uniswap-v3"),
  );
}

function cartridgeHealthy(owner: string): V3PositionRaw[] {
  return [
    pos(owner, "705111", POOL_WETH_USDC_005,
      RANGE_NORMAL[0], RANGE_NORMAL[1], WETH_USDC_IN_RANGE,
      "9.84", "16800", "0.147", "499.20", "uniswap-v3"),
  ];
}

function cartridgeDrifting(owner: string): V3PositionRaw[] {
  return [
    pos(owner, "711201", POOL_WETH_USDC_005,
      -200_200, -199_000, WETH_USDC_DRIFTING,
      "3.21", "4100", "0.032", "108.50", "uniswap-v3"),
    pos(owner, "711202", POOL_WETH_USDC_030,
      -200_800, -198_800, WETH_USDC_DRIFTING,
      "1.05", "1750", "0.018", "62.10", "uniswap-v3"),
    pos(owner, "711203", POOL_ARB_WETH,
      -118_200, -116_400, -117_600,
      "14220", "2.48", "142.20", "0.025", "camelot"),
  ];
}

function cartridgeMixed(owner: string): V3PositionRaw[] {
  // 2 in-range, 3 out-of-range
  return [
    pos(owner, "612001", POOL_WETH_USDC_005,
      RANGE_NORMAL[0], RANGE_NORMAL[1], WETH_USDC_IN_RANGE,
      "8.40", "14280", "0.084", "285.60", "uniswap-v3"),
    pos(owner, "612002", POOL_WETH_USDC_030,
      -202_000, -198_000, WETH_USDC_IN_RANGE,
      "5.10", "8670", "0.153", "520.20", "uniswap-v3"),
    pos(owner, "612003", POOL_WETH_USDC_005,
      RANGE_NORMAL[0], RANGE_NORMAL[1], WETH_USDC_OOR_UP,
      "0", "32000", "0", "0", "uniswap-v3"),
    pos(owner, "612004", POOL_WETH_USDC_005,
      -201_000, -199_000, WETH_USDC_OOR_UP,
      "0", "28500", "0", "0", "uniswap-v3"),
    pos(owner, "612005", POOL_WETH_USDC_005,
      -200_800, -199_200, WETH_USDC_OOR_UP,
      "0", "19800", "0", "0", "camelot"),
  ];
}

function cartridgeWhale(owner: string): V3PositionRaw[] {
  return [
    pos(owner, "920001", POOL_WETH_USDC_005,
      RANGE_NORMAL[0], RANGE_NORMAL[1], WETH_USDC_IN_RANGE,
      "1200", "4080000", "18.00", "61200", "uniswap-v3"),
    pos(owner, "920002", POOL_WETH_USDC_030,
      -202_000, -198_000, WETH_USDC_IN_RANGE,
      "980", "3332000", "29.40", "99960", "uniswap-v3"),
    pos(owner, "920003", POOL_WETH_USDC_005,
      -200_500, -199_500, WETH_USDC_IN_RANGE,
      "1450", "4930000", "14.50", "49300", "camelot"),
    pos(owner, "920004", POOL_ARB_WETH,
      -118_600, -116_200, -117_600,
      "2800000", "820", "56000", "16.40", "uniswap-v3"),
    pos(owner, "920005", POOL_WBTC_WETH,
      -261_000, -259_000, -260_000,
      "8.40", "340", "0.126", "5.10", "uniswap-v3"),
  ];
}

function cartridgePortfolio(owner: string): V3PositionRaw[] {
  const wuTick = { h: WETH_USDC_IN_RANGE, d: WETH_USDC_DRIFTING, b: WETH_USDC_OOR_UP };
  const positions: V3PositionRaw[] = [
    // WETH/USDC V3 (6)
    pos(owner, "605311", POOL_WETH_USDC_005, -201_200, -199_000, wuTick.h, "4.20", "7140", "0.063", "214.20", "uniswap-v3"),
    pos(owner, "605312", POOL_WETH_USDC_005, -201_200, -199_000, wuTick.d, "2.10", "3360", "0.008", "25.20",  "uniswap-v3"),
    pos(owner, "605313", POOL_WETH_USDC_005, -201_200, -199_000, wuTick.b, "0",    "14200","0",     "0",      "uniswap-v3"),
    pos(owner, "605314", POOL_WETH_USDC_030, -202_200, -198_000, wuTick.h, "5.80", "9860", "0.116", "394.40", "uniswap-v3"),
    pos(owner, "605315", POOL_WETH_USDC_005, -201_000, -199_500, wuTick.d, "1.10", "1760", "0.003", "8.80",   "uniswap-v3"),
    pos(owner, "605316", POOL_WETH_USDC_005, -201_200, -199_000, wuTick.b, "0",    "8600", "0",     "0",      "uniswap-v3"),
    // ARB/WETH Camelot (3)
    pos(owner, "615001", POOL_ARB_WETH, -118_600, -116_200, -117_600, "9800",  "2.88", "196",  "0.058", "camelot"),
    pos(owner, "615002", POOL_ARB_WETH, -118_400, -116_600, -117_600, "5100",  "1.50", "51",   "0.015", "camelot"),
    pos(owner, "615003", POOL_ARB_WETH, -119_000, -116_000, -117_600, "12400", "3.65", "372",  "0.109", "camelot"),
    // WBTC/WETH V3 (2)
    pos(owner, "618001", POOL_WBTC_WETH, -261_200, -259_000, -260_100, "0.32", "14.08", "0.003", "0.130", "uniswap-v3"),
    pos(owner, "618002", POOL_WBTC_WETH, -261_000, -259_200, -260_100, "0.18", "7.92",  "0.001", "0.072", "uniswap-v3"),
    // LINK/WETH V3 (2)
    pos(owner, "622001", POOL_LINK_WETH, -77_200, -75_000, -76_200, "820",  "1.23", "4.10",  "0.006", "uniswap-v3"),
    pos(owner, "622002", POOL_LINK_WETH, -77_000, -75_200, -76_200, "480",  "0.72", "2.40",  "0.004", "uniswap-v3"),
    // USDC/USDT stable (2)
    pos(owner, "630001", POOL_USDC_USDT, -10, 10, 0, "24200", "24200", "96.80",  "96.80",  "uniswap-v3"),
    pos(owner, "630002", POOL_USDC_USDT, -5,  5,  0, "18500", "18500", "74.00",  "74.00",  "uniswap-v3"),
  ];
  return positions;
}

/**
 * Returns wallet-specific demo positions, or null for unknown wallets.
 * Used by positionAggregator as a fallback when RPC returns no positions.
 */
export function getWalletMock(address: string): V3PositionRaw[] | null {
  const slot = DEMO_WALLETS[address.toLowerCase()];
  if (!slot) return null;
  const owner = address.toLowerCase();
  switch (slot) {
    case "bleeding":  return cartridgeBleeding(owner);
    case "healthy":   return cartridgeHealthy(owner);
    case "drifting":  return cartridgeDrifting(owner);
    case "mixed":     return cartridgeMixed(owner);
    case "whale":     return cartridgeWhale(owner);
    case "portfolio": return cartridgePortfolio(owner);
    default:          return null;
  }
}

/** @deprecated Use getWalletMock instead. Kept for backward compat with scripts. */
export function getMockArbitrumPositions(address: string): V3PositionRaw[] {
  return getWalletMock(address) ?? cartridgeHealthy(address);
}
