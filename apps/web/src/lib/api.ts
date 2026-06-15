// Typed fetch wrapper for the LPGuardian server. In local dev, Vite also proxies
// /api and /health to the configured backend base URL. In production we must
// hit the deployed backend directly.

// TODO(robinhood): set after backend is deployed
const DEFAULT_API_BASE_URL = "";

export function resolveApiBaseUrl(): string {
  const raw =
    (import.meta.env.VITE_LPGUARDIAN_API_URL as string | undefined) ??
    (import.meta.env.VITE_API_URL as string | undefined) ??
    DEFAULT_API_BASE_URL;
  if (
    !raw.trim() ||
    raw.includes("localhost:3001")
  ) {
    return DEFAULT_API_BASE_URL;
  }
  return raw.replace(/\/+$/, "");
}

export const API_BASE_URL = resolveApiBaseUrl();

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
    /** Current pool tick — used by classifyHealth to detect out-of-range
     *  positions. Nullable when the subgraph hasn't indexed any swaps yet. */
    tick: string | null;
    token0: { id: string; symbol: string; decimals: string };
    token1: { id: string; symbol: string; decimals: string };
  };
  /** Source protocol — used to disambiguate the diagnose resolver (the same
   *  tokenId can exist on multiple PositionManagers). Additive/optional. */
  protocol?: "uniswap-v3" | "uniswap-v4" | "camelot";
}

export interface PortfolioRisk {
  riskScoreBps: number;
  riskTier: number; // 0=Healthy, 1=Amber, 2=Red
  recommendedAction: number;
  source: string;
  metrics: {
    totalPositions: number;
    outOfRangePositions: number;
    dustPositions: number;
    correlatedExposureBps: number;
    concentrationBps: number;
  };
}

export interface PositionsResponse {
  address: string;
  version: number;
  source?: string;
  chainId?: number;
  positions: V3PositionRaw[];
  portfolioRisk?: PortfolioRisk;
  portfolioRiskInput?: {
    totalPositions: string;
    outOfRangePositions: string;
    dustPositions: string;
    correlatedExposureBps: string;
    concentrationBps: string;
  };
  sources?: Array<{
    name: string;
    label: string;
    notes?: string[];
  }>;
}

interface ApiSuccess<T> {
  status: "ok";
  data: T;
}

export interface HealthResponse {
  status: string;
  service: string;
  env: string;
  subgraph: "ready" | "no-api-key";
}

export async function fetchPositions(
  address: string,
): Promise<PositionsResponse> {
  const r = await fetch(`${API_BASE_URL}/api/positions/${address}`);
  if (!r.ok) throw new Error(`positions ${r.status}`);
  return r.json();
}

export async function fetchPortfolioPositions(
  address: string,
): Promise<PositionsResponse> {
  const r = await fetch(`${API_BASE_URL}/api/portfolio/${address}/positions`);
  if (!r.ok) throw new Error(`portfolio positions ${r.status}`);
  const body = (await r.json()) as ApiSuccess<PositionsResponse>;
  return body.data;
}

export async function fetchHealth(): Promise<HealthResponse> {
  const r = await fetch(`${API_BASE_URL}/health`);
  if (!r.ok) throw new Error(`health ${r.status}`);
  return r.json();
}
