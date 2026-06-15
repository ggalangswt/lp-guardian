import type { Address } from "viem";
import type { ServerConfig } from "../../config.js";
import {
  AgentStateStore,
  type AgentStateRepository,
} from "../agentStateStore.js";
import { runFoundationAgents } from "../agentOrchestrator.js";
import { PortfolioService } from "./portfolioService.js";
import type { WalletRiskInputResult } from "./walletRiskInput.js";

const DEFAULT_MONITOR_INTERVAL_MS = 5 * 60 * 1000;
const PAUSE_AFTER_FAILURES = 3;
const FAILURE_PAUSE_MS = 15 * 60 * 1000;
const MAX_ALERT_HISTORY = 100;

export type MonitorWalletStatus = "unknown" | "healthy" | "alert" | "error" | "paused";

export interface MonitorAlert {
  id: string;
  walletAddress: Address;
  correlationId: string;
  runId: string;
  issues: string[];
  createdAt: string;
}

export interface MonitorWalletState {
  walletAddress: Address;
  status: MonitorWalletStatus;
  watched: boolean;
  lastCheckedAt?: string;
  nextCheckAt?: string;
  pausedUntil?: string;
  failureCount: number;
  lastError?: string;
  issues: string[];
  lastAlert?: MonitorAlert;
  riskInput?: {
    totalPositions: string;
    outOfRangePositions: string;
    dustPositions: string;
    correlatedExposureBps: string;
    concentrationBps: string;
  };
  scan?: {
    fromBlock: string;
    toBlock: string;
    transferCount: number;
    currentlyOwnedTokenIds: string[];
  };
}

export interface MonitorSnapshot {
  running: boolean;
  intervalMs: number;
  watchedWallets: Address[];
  wallets: MonitorWalletState[];
  alerts: MonitorAlert[];
  updatedAt: string;
}

export type MonitorStreamEventType =
  | "monitor.wallet.snapshot"
  | "monitor.wallet.watched"
  | "monitor.wallet.unwatched"
  | "monitor.wallet.scanned"
  | "monitor.wallet.alert"
  | "monitor.wallet.error"
  | "monitor.wallet.paused";

export interface MonitorStreamEvent {
  event: MonitorStreamEventType;
  id?: string;
  walletAddress: Address;
  data: MonitorWalletState | MonitorAlert;
}

type MonitorStreamListener = (event: MonitorStreamEvent) => void;

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeWallet(walletAddress: Address): Address {
  return walletAddress.toLowerCase() as Address;
}

function alertId(walletAddress: Address): string {
  return `alert__${walletAddress.slice(2, 10)}__${Date.now()}__${Math.random()
    .toString(16)
    .slice(2)}`;
}

function riskInputWire(risk: WalletRiskInputResult): MonitorWalletState["riskInput"] {
  return {
    totalPositions: risk.riskInput.totalPositions.toString(),
    outOfRangePositions: risk.riskInput.outOfRangePositions.toString(),
    dustPositions: risk.riskInput.dustPositions.toString(),
    correlatedExposureBps: risk.riskInput.correlatedExposureBps.toString(),
    concentrationBps: risk.riskInput.concentrationBps.toString(),
  };
}

function scanWire(risk: WalletRiskInputResult): MonitorWalletState["scan"] {
  return {
    fromBlock: risk.scan.fromBlock.toString(),
    toBlock: risk.scan.toBlock.toString(),
    transferCount: risk.scan.transfers.length,
    currentlyOwnedTokenIds: risk.scan.currentlyOwnedTokenIds.map((id) =>
      id.toString(),
    ),
  };
}

function detectIssues(risk: WalletRiskInputResult): string[] {
  const issues: string[] = [];
  if (risk.riskInput.correlatedExposureBps > 8000n) {
    issues.push("High correlation detected");
  }
  if (risk.riskInput.concentrationBps > 7000n) {
    issues.push("High concentration detected");
  }
  if (risk.riskInput.outOfRangePositions > 0n) {
    issues.push(`${risk.riskInput.outOfRangePositions.toString()} positions out-of-range`);
  }
  return issues;
}

export class MonitorService {
  private interval: NodeJS.Timeout | null = null;
  private intervalMs = DEFAULT_MONITOR_INTERVAL_MS;
  private readonly watchedWallets = new Set<Address>();
  private readonly states = new Map<Address, MonitorWalletState>();
  private readonly alerts: MonitorAlert[] = [];
  private readonly portfolioService: PortfolioService;
  private readonly walletListeners = new Map<Address, Set<MonitorStreamListener>>();

  constructor(
    private readonly config: ServerConfig,
    private readonly stateStore: AgentStateRepository = new AgentStateStore(),
  ) {
    this.portfolioService = new PortfolioService(config);

    const restored = this.stateStore.getMonitor();
    restored.wallets.forEach((state) => {
      this.states.set(normalizeWallet(state.walletAddress), state);
    });
    restored.watchedWallets.forEach((wallet) => {
      this.watchedWallets.add(normalizeWallet(wallet));
    });
    this.alerts.push(...restored.alerts);

    // Only auto-seed when ROBINHOOD_NFPM_ADDRESS is configured; without it every
    // tick errors immediately (the scan requires a valid NFPM contract address).
    if (this.watchedWallets.size > 0 || this.states.size > 0) return;
    if (!config.robinhoodNfpmAddress) return;

    // Seed the canonical Robinhood demo wallet so MonitorService has at least
    // one live position to watch from startup.
    const seedWallets: Address[] = [];
    if (config.robinhoodCanonicalWalletAddress) {
      seedWallets.push(config.robinhoodCanonicalWalletAddress as Address);
    }
    seedWallets.forEach((wallet) => this.watch(wallet));
  }

  watch(walletAddress: Address): MonitorWalletState {
    const wallet = normalizeWallet(walletAddress);
    this.watchedWallets.add(wallet);
    const existing = this.states.get(wallet);
    if (existing) {
      const next = { ...existing, watched: true };
      this.states.set(wallet, next);
      this.persistMonitor();
      this.emitWallet(wallet, {
        event: "monitor.wallet.watched",
        id: `watch__${wallet}__${Date.now()}`,
        walletAddress: wallet,
        data: next,
      });
      return next;
    }

    const state: MonitorWalletState = {
      walletAddress: wallet,
      status: "unknown",
      watched: true,
      failureCount: 0,
      issues: [],
    };
    this.states.set(wallet, state);
    this.persistMonitor();
    this.emitWallet(wallet, {
      event: "monitor.wallet.watched",
      id: `watch__${wallet}__${Date.now()}`,
      walletAddress: wallet,
      data: state,
    });
    return state;
  }

  unwatch(walletAddress: Address): MonitorWalletState | undefined {
    const wallet = normalizeWallet(walletAddress);
    this.watchedWallets.delete(wallet);
    const existing = this.states.get(wallet);
    if (!existing) return undefined;

    const next = { ...existing, watched: false };
    this.states.set(wallet, next);
    this.persistMonitor();
    this.emitWallet(wallet, {
      event: "monitor.wallet.unwatched",
      id: `unwatch__${wallet}__${Date.now()}`,
      walletAddress: wallet,
      data: next,
    });
    return next;
  }

  getWalletState(walletAddress: Address): MonitorWalletState | undefined {
    return this.states.get(normalizeWallet(walletAddress));
  }

  subscribeWallet(
    walletAddress: Address,
    listener: MonitorStreamListener,
  ): () => void {
    const wallet = normalizeWallet(walletAddress);
    const listeners = this.walletListeners.get(wallet) ?? new Set();
    listeners.add(listener);
    this.walletListeners.set(wallet, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.walletListeners.delete(wallet);
      }
    };
  }

  snapshot(): MonitorSnapshot {
    return {
      running: Boolean(this.interval),
      intervalMs: this.intervalMs,
      watchedWallets: Array.from(this.watchedWallets).sort(),
      wallets: Array.from(this.states.values()).sort((left, right) =>
        left.walletAddress.localeCompare(right.walletAddress),
      ),
      alerts: [...this.alerts],
      updatedAt: nowIso(),
    };
  }

  start(intervalMs: number = DEFAULT_MONITOR_INTERVAL_MS): void {
    if (this.interval) return;

    this.intervalMs = intervalMs;
    console.log(
      `[MonitorService] Starting autonomous portfolio monitoring every ${intervalMs / 1000}s...`,
    );
    this.interval = setInterval(() => this.tick(), intervalMs);
    this.tick().catch((error: unknown) =>
      console.error("[MonitorService] Initial tick failed:", error),
    );
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private nextCheckAt(): string {
    return new Date(Date.now() + this.intervalMs).toISOString();
  }

  private rememberAlert(alert: MonitorAlert): void {
    this.alerts.unshift(alert);
    if (this.alerts.length > MAX_ALERT_HISTORY) {
      this.alerts.length = MAX_ALERT_HISTORY;
    }
  }

  private persistMonitor(): void {
    this.stateStore.putMonitor({
      watchedWallets: Array.from(this.watchedWallets).sort(),
      wallets: Array.from(this.states.values()).sort((left, right) =>
        left.walletAddress.localeCompare(right.walletAddress),
      ),
      alerts: [...this.alerts],
    });
  }

  private async tick(): Promise<void> {
    const wallets = Array.from(this.watchedWallets);
    if (wallets.length === 0) return;

    console.log(`[MonitorService] Ticking: scanning ${wallets.length} watched wallets...`);

    for (const wallet of wallets) {
      const current = this.states.get(wallet);
      if (current?.pausedUntil && Date.parse(current.pausedUntil) > Date.now()) {
        continue;
      }

      await this.scanWallet(wallet);
    }
  }

  private async scanWallet(wallet: Address): Promise<void> {
    try {
      const risk = await this.portfolioService.getWalletPositions(wallet);
      const issues = detectIssues(risk);
      const checkedAt = nowIso();
      let lastAlert = this.states.get(wallet)?.lastAlert;

      if (issues.length > 0) {
        console.warn(`[MonitorService] ALERT for ${wallet}: ${issues.join(", ")}`);
        const run = runFoundationAgents({
          mode: "mock",
          note: (agent) =>
            `Monitor Agent detected anomalies in wallet ${wallet}: ${issues.join(
              ", ",
            )}. Triggering ${agent} analysis.`,
        });
        lastAlert = {
          id: alertId(wallet),
          walletAddress: wallet,
          correlationId: run.run.correlationId,
          runId: run.run.id,
          issues,
          createdAt: checkedAt,
        };
        this.rememberAlert(lastAlert);
      } else {
        console.log(`[MonitorService] ${wallet} is healthy.`);
      }

      const nextState: MonitorWalletState = {
        walletAddress: wallet,
        status: issues.length > 0 ? "alert" : "healthy",
        watched: true,
        lastCheckedAt: checkedAt,
        nextCheckAt: this.nextCheckAt(),
        failureCount: 0,
        issues,
        lastAlert,
        riskInput: riskInputWire(risk),
        scan: scanWire(risk),
      };
      this.states.set(wallet, nextState);
      this.persistMonitor();
      this.emitWallet(wallet, {
        event: "monitor.wallet.scanned",
        id: `scan__${wallet}__${Date.now()}`,
        walletAddress: wallet,
        data: nextState,
      });
      if (lastAlert && lastAlert.createdAt === checkedAt) {
        this.emitWallet(wallet, {
          event: "monitor.wallet.alert",
          id: lastAlert.id,
          walletAddress: wallet,
          data: lastAlert,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const previous = this.states.get(wallet);
      const failureCount = (previous?.failureCount ?? 0) + 1;
      const pausedUntil =
        failureCount >= PAUSE_AFTER_FAILURES
          ? new Date(Date.now() + FAILURE_PAUSE_MS).toISOString()
          : undefined;

      console.error(`[MonitorService] Failed to scan ${wallet}:`, error);
      const nextState: MonitorWalletState = {
        ...previous,
        walletAddress: wallet,
        status: pausedUntil ? "paused" : "error",
        watched: true,
        lastCheckedAt: nowIso(),
        nextCheckAt: pausedUntil ? undefined : this.nextCheckAt(),
        pausedUntil,
        failureCount,
        lastError: message,
        issues: previous?.issues ?? [],
      };
      this.states.set(wallet, nextState);
      this.persistMonitor();
      this.emitWallet(wallet, {
        event: pausedUntil ? "monitor.wallet.paused" : "monitor.wallet.error",
        id: `error__${wallet}__${Date.now()}`,
        walletAddress: wallet,
        data: nextState,
      });
    }
  }

  private emitWallet(walletAddress: Address, event: MonitorStreamEvent): void {
    const listeners = this.walletListeners.get(normalizeWallet(walletAddress));
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  }
}
