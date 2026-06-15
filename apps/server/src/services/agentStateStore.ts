import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AgentMessage, AgentRunStatus, AgentType } from "@lp-guardian/core";
import type { Address } from "viem";
import type { StoredAgentRun } from "./agentOrchestrator.js";
import type {
  MonitorAlert,
  MonitorWalletState,
} from "./portfolio/monitorService.js";

interface PersistedMonitorState {
  watchedWallets: Address[];
  wallets: MonitorWalletState[];
  alerts: MonitorAlert[];
}

interface PersistedAgentState {
  version: 1;
  runs: StoredAgentRun[];
  monitor: PersistedMonitorState;
}

export interface ListRunsFilter {
  walletAddress?: Address;
  targetAgent?: AgentType;
  status?: AgentRunStatus;
  limit?: number;
}

export interface AgentStateRepository {
  listRuns(filter?: ListRunsFilter): StoredAgentRun[];
  getRun(runId: string): StoredAgentRun | undefined;
  getRunByIdempotencyKey(idempotencyKey: string): StoredAgentRun | undefined;
  listDeadLetters(filter?: ListRunsFilter): StoredAgentRun[];
  getMessages(correlationId: string): AgentMessage[];
  putRun(run: StoredAgentRun): void;
  getMonitor(): PersistedMonitorState;
  putMonitor(monitor: PersistedMonitorState): void;
}

const DEFAULT_STATE_FILE = join(
  process.cwd(),
  ".lp-guardian",
  "agent-state.json",
);

function initialState(): PersistedAgentState {
  return {
    version: 1,
    runs: [],
    monitor: {
      watchedWallets: [],
      wallets: [],
      alerts: [],
    },
  };
}

function stateFilePath(): string {
  return process.env.LPGUARDIAN_AGENT_STATE_FILE ?? DEFAULT_STATE_FILE;
}

export class AgentStateStore implements AgentStateRepository {
  private state: PersistedAgentState;

  constructor(private readonly filePath = stateFilePath()) {
    this.state = this.load();
  }

  listRuns(filter: ListRunsFilter = {}): StoredAgentRun[] {
    const wallet = filter.walletAddress?.toLowerCase();
    const runs = this.state.runs
      .filter((entry) => {
        if (wallet && entry.input.walletAddress.toLowerCase() !== wallet) {
          return false;
        }
        if (filter.targetAgent && entry.input.targetAgent !== filter.targetAgent) {
          return false;
        }
        if (filter.status && entry.run.status !== filter.status) {
          return false;
        }
        return true;
      })
      .sort((left, right) => right.run.startedAt - left.run.startedAt);

    return typeof filter.limit === "number" ? runs.slice(0, filter.limit) : runs;
  }

  getRun(runId: string): StoredAgentRun | undefined {
    return this.state.runs.find((entry) => entry.run.id === runId);
  }

  getRunByIdempotencyKey(idempotencyKey: string): StoredAgentRun | undefined {
    return this.state.runs.find(
      (entry) => entry.meta?.idempotencyKey === idempotencyKey,
    );
  }

  listDeadLetters(filter: ListRunsFilter = {}): StoredAgentRun[] {
    return this.listRuns(filter).filter((entry) => entry.meta?.deadLetter);
  }

  getMessages(correlationId: string): AgentMessage[] {
    return (
      this.state.runs.find(
        (entry) => entry.run.correlationId === correlationId,
      )?.messages ?? []
    );
  }

  putRun(run: StoredAgentRun): void {
    const nextRuns = this.state.runs.filter((entry) => entry.run.id !== run.run.id);
    nextRuns.push(run);
    this.state = {
      ...this.state,
      runs: nextRuns,
    };
    this.persist();
  }

  getMonitor(): PersistedMonitorState {
    return this.state.monitor;
  }

  putMonitor(monitor: PersistedMonitorState): void {
    this.state = {
      ...this.state,
      monitor,
    };
    this.persist();
  }

  private load(): PersistedAgentState {
    if (!existsSync(this.filePath)) return initialState();

    try {
      const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedAgentState;
      if (parsed.version !== 1) return initialState();

      return {
        version: 1,
        runs: Array.isArray(parsed.runs) ? parsed.runs : [],
        monitor: {
          watchedWallets: parsed.monitor?.watchedWallets ?? [],
          wallets: parsed.monitor?.wallets ?? [],
          alerts: parsed.monitor?.alerts ?? [],
        },
      };
    } catch (error) {
      console.warn(`[AgentStateStore] Failed to load state file: ${String(error)}`);
      return initialState();
    }
  }

  private persist(): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmpPath = `${this.filePath}.tmp`;
    writeFileSync(tmpPath, JSON.stringify(this.state, null, 2));
    renameSync(tmpPath, this.filePath);
  }
}
