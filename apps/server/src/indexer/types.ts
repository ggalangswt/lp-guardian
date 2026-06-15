// Wire shape returned by /api/positions/:address. The base fields match the
// frontend's V3PositionRaw exactly; the optional fields are additive and safe
// for older clients to ignore.

export interface RawToken {
  id: string;
  symbol: string;
  decimals: string;
}

export type Protocol = "uniswap-v3" | "uniswap-v4" | "camelot";

export interface V3PositionRaw {
  id: string;
  owner: string;
  liquidity: string;
  depositedToken0: string;
  depositedToken1: string;
  collectedFeesToken0: string;
  collectedFeesToken1: string;
  tickLower: { tickIdx: string };
  tickUpper: { tickIdx: string };
  pool: {
    id: string;
    feeTier: string;
    tickSpacing: string;
    tick: string | null;
    token0: RawToken;
    token1: RawToken;
  };

  // --- additive extensions ---
  protocol?: Protocol;
  chainId?: number;
  currentValueUSD?: number;
  isInRange?: boolean;
}

export type DataSource = "onchain" | "mock";

export interface PositionsResult {
  address: string;
  version: number;
  positions: V3PositionRaw[];
  source: DataSource;
  warnings: string[];
}
