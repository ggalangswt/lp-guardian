// Shared types between server, web, agent, and mcp-server.

export type ChainId =
  | 1
  | 11155111
  | 8453
  | 42161
  | 10
  | 137
  | 5000
  | 5003
  | 46630;

export interface Token {
  address: string;
  symbol: string;
  decimals: number;
}

export interface Pool {
  id: string;
  chainId: ChainId;
  address: string;
  token0: Token;
  token1: Token;
  feeTier: number;
  tickSpacing: number;
  hooks?: string | null;
  tvlUsdCached?: string;
  volumeUsdCached?: string;
}

export interface Position {
  id: string;
  chainId: ChainId;
  version: 3 | 4;
  tokenId: string;
  owner: string;
  pool: Pool;
  tickLower: number;
  tickUpper: number;
  liquidity: string;
  depositedToken0: string;
  depositedToken1: string;
  collectedFees0: string;
  collectedFees1: string;
  createdAtBlock: string;
}

export type HealthStatus = "green" | "amber" | "red";

export type HookFamily =
  | "DYNAMIC_FEE"
  | "JIT_PROTECTED"
  | "LVR_RESISTANT"
  | "MEMECOIN_ROYALTY"
  | "CUSTOM_LIFECYCLE"
  | "SWAP_DELTA_CUT"
  | "GATED_SWAP"
  | "INIT_GATE"
  | "UNKNOWN";

export interface HookInfo {
  address: string;
  flagsBitmap: number;
  family: HookFamily;
  name?: string;
  auditStatus?: "AUDITED" | "UNAUDITED" | "UNKNOWN";
  tvlUsd?: string;
  volumeUsd?: string;
}

// Diagnostic SSE event stream — typed events emitted by the agent's
// phase pipeline and consumed by the panel renderers / typewriter narrative.
export type DiagnosticEvent =
  | { type: "phase.start"; phase: number; label: string }
  | { type: "phase.end"; phase: number; durationMs: number }
  | { type: "tool.call"; tool: string; input: unknown }
  | { type: "tool.result"; tool: string; output: unknown; latencyMs: number }
  | { type: "narrative"; text: string }
  | { type: "node.add"; nodeType: string; id: string; data: unknown }
  | { type: "edge.draw"; from: string; to: string; kind: string }
  | { type: "edge.pulse"; from: string; to: string }
  | {
      type: "agent.advice";
      provider: string;
      recommendation: string;
      confidence: number;
      rationale: string;
      labels: Record<string, string>;
    }
  | { type: "verdict.partial"; markdown: string }
  | { type: "verdict.final"; markdown: string; labels: Record<string, string> }
  | { type: "report.uploaded"; rootHash: string; storageUrl: string }
  | { type: "report.anchored"; txHash: string; chainId: number }
  | { type: "error"; phase?: number; message: string };
