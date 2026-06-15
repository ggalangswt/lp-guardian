
import type { Label } from "./honesty.js";

export type AgentType =
  | "scan"
  | "correlate"
  | "simulate"
  | "optimize"
  | "execute"
  | "monitor";

export type AgentRunStatus =
  | "queued"
  | "running"
  | "waiting_for_user"
  | "completed"
  | "failed"
  | "cancelled";

export type AgentTopic =
  | "positions.scanned"
  | "portfolio.correlated"
  | "portfolio.simulated"
  | "portfolio.optimized"
  | "portfolio.executed"
  | "portfolio.alert"
  | "user.approved"
  | "agent.failed";

export interface AgentMessage<TPayload = unknown> {
  id: string;
  timestamp: number;
  source: AgentType;
  target: AgentType | "all";
  topic: AgentTopic;
  payload: TPayload;
  correlationId: string;
  teeAttestation?: string;
}

export interface AgentRun {
  id: string;
  status: AgentRunStatus;
  startedAt: number;
  completedAt?: number;
  currentAgent?: AgentType;
  correlationId: string;
  error?: AgentError;
}

export interface AgentError {
  code: string;
  message: string;
  retryable: boolean;
  source?: AgentType;
}

export interface DataFreshness {
  status: "fresh" | "stale" | "mocked" | "unknown";
  checkedAt: number;
  source?: string;
  warning?: string;
}

export interface AgentProvenance {
  source: string;
  label: Label;
  fetchedAt?: number;
  freshness?: DataFreshness;
  warnings?: string[];
}