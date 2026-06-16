import type {
  AgentMessage,
  AgentRun,
  AgentRunStatus,
  AgentType,
  AgentTopic,
} from "@lp-guardian/core";
import { externalAgentName } from "@lp-guardian/core";
import { keccak256, toBytes, type Address, type Hex } from "viem";
import type { ServerConfig } from "../config.js";
import type { FoundationRunRequest } from "../schemas/agent.js";
import {
  AgentStateStore,
  type AgentStateRepository,
  type ListRunsFilter,
} from "./agentStateStore.js";
import {
  InMemoryAgentRunQueue,
  type AgentRunQueue,
  type AgentRunQueueSnapshot,
} from "./agentRunQueue.js";
import { MonitorService } from "./portfolio/monitorService.js";
import { PortfolioService } from "./portfolio/portfolioService.js";
import type { WalletRiskInputResult } from "./portfolio/walletRiskInput.js";
import type { AggregateRiskPipelineResult } from "./portfolio/aggregateRiskPipeline.js";
import type {
  PortfolioRiskInput,
  PortfolioRiskResult,
} from "./robinhood/riskEngine.js";
import {
  BeDataClient,
  type BeDataResult,
  type CorrelationResponse,
  type OptimizeResponse,
  type SimulateResponse,
  type TeeSignResponse,
} from "./beDataClient.js";
import { fetchMantlePriceHistory } from "../prices/mantlePriceHistory.js";
import { recordTuringDecision, recordTuringOutcome } from "../chain/turingRegistry.js";

export type FoundationRunMode = "mock" | "eliza";

export interface FoundationAgentRunResult {
  run: AgentRun;
  messages: AgentMessage[];
}

interface FoundationAgentRunOptions {
  mode: FoundationRunMode;
  note: (agent: AgentType) => string;
  correlationId?: string;
}

export interface AgentOrchestrationInput {
  walletAddress: Address;
  tokenId?: string;
  scenario?: FoundationRunRequest["scenario"] | string;
  targetAgent?: AgentType;
  idempotencyKey?: string;
  dryRun?: boolean;
  userApproved?: boolean;
  publishReport?: boolean;
  recordTuringDecision?: boolean;
  recordTuringOutcome?: boolean;
  turingDecisionId?: string;
  simulatedPnlBps?: string;
  simulatedScoreBps?: number;
  requirePhala?: boolean;
  requireTee?: boolean;
  phalaAttestationHash?: Hex;
  teeAttestationHash?: Hex;
}

export interface AgentOrchestrationResult {
  run: AgentRun;
  messages: AgentMessage[];
}

export type AgentStepStatus = "pending" | "running" | "completed" | "failed";

export interface AgentStepProgress {
  agent: AgentType;
  status: AgentStepStatus;
  attempts: number;
  maxAttempts: number;
  startedAt?: number;
  completedAt?: number;
  lastError?: string;
  outputMessageId?: string;
}

export interface StoredAgentRun extends AgentOrchestrationResult {
  input: AgentOrchestrationInput;
  meta?: {
    idempotencyKey?: string;
    attempts: number;
    maxAttempts: number;
    nextAttemptAt?: number;
    lastError?: string;
    deadLetter?: boolean;
    steps?: Partial<Record<AgentType, AgentStepProgress>>;
  };
}

export interface AgentStreamEvent {
  event: string;
  id?: string;
  data: unknown;
}

type AgentStreamListener = (event: AgentStreamEvent) => void;

const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_STEP_MAX_ATTEMPTS = 2;
const RETRY_BASE_DELAY_MS = 1_000;
const RETRY_MAX_DELAY_MS = 30_000;

interface AgentContext {
  input: AgentOrchestrationInput;
  correlationId: string;
  scan?: WalletRiskInputResult;
  diagnosis?: AggregateRiskPipelineResult;
  optimization?: RebalanceProposalPreview;
  beDataCorrelation?: BeDataResult<CorrelationResponse>;
  beDataSimulation?: BeDataResult<SimulateResponse>;
  beDataOptimization?: BeDataResult<OptimizeResponse>;
  beDataTeeSign?: BeDataResult<TeeSignResponse>;
}

interface AgentMessageProvenance {
  agent: AgentType;
  externalAgent: ReturnType<typeof externalAgentName>;
  tee: {
    label: "VERIFIED" | "EMULATED";
    provider: "phala" | "unavailable";
    attestationHash?: Hex;
    verifier?: string;
    warnings: string[];
  };
}

interface RebalanceActionPreview {
  actionType: "hold" | "close" | "consolidate" | "rebalance" | "monitor";
  sequence: number;
  description: string;
  sourceTokenId?: string;
  estimatedGas: number;
}

interface RebalanceProposalPreview {
  proposalHash: Hex;
  status: "preview";
  expiresAt: number;
  recommendedAction: "hold" | "rebalance" | "close";
  expectedOutcome: {
    riskScoreBps: bigint;
    expectedRiskReductionBps: bigint;
    expectedRiskConcentrationBps: bigint;
  };
  cost: {
    gasEstimateUSD: number;
    slippageEstimateBps: number;
  };
  actions: RebalanceActionPreview[];
  reportRoot: Hex;
  simulationScenario: string;
}

function createId(prefix: string): string {
  return `${prefix}__${Date.now()}__${Math.random().toString(16).slice(2)}`;
}

function idempotencyKeyFor(input: AgentOrchestrationInput): string {
  return input.idempotencyKey ?? [
    input.walletAddress.toLowerCase(),
    input.targetAgent ?? "correlate",
    input.tokenId ?? "",
    input.scenario ?? "",
    input.dryRun === false ? "execute" : "dry-run",
  ].join(":");
}

function retryDelayMs(attempts: number): number {
  return Math.min(
    RETRY_BASE_DELAY_MS * (2 ** Math.max(0, attempts - 1)),
    RETRY_MAX_DELAY_MS,
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTerminalStatus(status: AgentRunStatus): boolean {
  return ["waiting_for_user", "completed", "failed", "cancelled"].includes(status);
}

function pendingStep(agent: AgentType): AgentStepProgress {
  return {
    agent,
    status: "pending",
    attempts: 0,
    maxAttempts: DEFAULT_STEP_MAX_ATTEMPTS,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function bigintFromWire(value: unknown): bigint | undefined {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^\d+$/.test(value)) return BigInt(value);
  return undefined;
}

function riskInputFromWire(value: unknown): PortfolioRiskInput | undefined {
  if (!isRecord(value)) return undefined;
  const totalPositions = bigintFromWire(value.totalPositions);
  const outOfRangePositions = bigintFromWire(value.outOfRangePositions);
  const dustPositions = bigintFromWire(value.dustPositions);
  const correlatedExposureBps = bigintFromWire(value.correlatedExposureBps);
  const concentrationBps = bigintFromWire(value.concentrationBps);

  if (
    totalPositions === undefined ||
    outOfRangePositions === undefined ||
    dustPositions === undefined ||
    correlatedExposureBps === undefined ||
    concentrationBps === undefined
  ) {
    return undefined;
  }

  return {
    totalPositions,
    outOfRangePositions,
    dustPositions,
    correlatedExposureBps,
    concentrationBps,
  };
}

function riskOutputFromWire(value: unknown): PortfolioRiskResult | undefined {
  if (!isRecord(value)) return undefined;
  const riskScoreBps = bigintFromWire(value.riskScoreBps);
  const rawRiskTier = typeof value.riskTier === "number"
    ? value.riskTier
    : Number(value.riskTier);
  const rawRecommendedAction = typeof value.recommendedAction === "number"
    ? value.recommendedAction
    : Number(value.recommendedAction);

  if (
    riskScoreBps === undefined ||
    ![0, 1, 2].includes(rawRiskTier) ||
    ![0, 1, 2].includes(rawRecommendedAction)
  ) {
    return undefined;
  }

  return {
    riskScoreBps,
    riskTier: rawRiskTier as 0 | 1 | 2,
    recommendedAction: rawRecommendedAction as 0 | 1 | 2,
  };
}

function nonZeroHash(value: unknown): Hex | undefined {
  if (
    typeof value === "string" &&
    /^0x[a-fA-F0-9]{64}$/.test(value) &&
    !/^0x0{64}$/i.test(value)
  ) {
    return value as Hex;
  }

  return undefined;
}

function messageProvenance(
  context: AgentContext,
  agentType: AgentType,
  payload: unknown,
): {
  payload: unknown;
  teeAttestation?: Hex;
} {
  const payloadObject = isRecord(payload) ? payload : undefined;
  const attestationHash =
    nonZeroHash(context.input.teeAttestationHash) ??
    nonZeroHash(context.input.phalaAttestationHash) ??
    nonZeroHash(payloadObject?.attestationHash);
  const verified = Boolean(attestationHash);
  const provenance: AgentMessageProvenance = {
    agent: agentType,
    externalAgent: externalAgentName(agentType),
    tee: {
      label: verified ? "VERIFIED" : "EMULATED",
      provider: verified ? "phala" : "unavailable",
      attestationHash,
      warnings: verified
        ? []
        : [
            "No verified TEE attestation hash was supplied for this agent message.",
          ],
    },
  };

  const nextPayload = payloadObject
    ? {
        ...payloadObject,
        agentProvenance: provenance,
      }
    : {
        value: payload,
        agentProvenance: provenance,
      };

  return {
    payload: nextPayload,
    teeAttestation: attestationHash,
  };
}

function ensureMeta(
  storedRun: StoredAgentRun,
  sequence: AgentType[],
): NonNullable<StoredAgentRun["meta"]> {
  const steps: Partial<Record<AgentType, AgentStepProgress>> = {
    ...(storedRun.meta?.steps ?? {}),
  };
  storedRun.meta = {
    idempotencyKey: storedRun.meta?.idempotencyKey ?? idempotencyKeyFor(storedRun.input),
    attempts: storedRun.meta?.attempts ?? 0,
    maxAttempts: storedRun.meta?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    nextAttemptAt: storedRun.meta?.nextAttemptAt,
    lastError: storedRun.meta?.lastError,
    deadLetter: storedRun.meta?.deadLetter,
    steps,
  };

  for (const agent of sequence) {
    steps[agent] = {
      ...pendingStep(agent),
      ...steps[agent],
      agent,
      maxAttempts: steps[agent]?.maxAttempts ?? DEFAULT_STEP_MAX_ATTEMPTS,
    };
  }

  return storedRun.meta;
}

function findStepMessage(
  storedRun: StoredAgentRun,
  agentType: AgentType,
): AgentMessage | undefined {
  const outputMessageId = storedRun.meta?.steps?.[agentType]?.outputMessageId;
  if (outputMessageId) {
    const byId = storedRun.messages.find((message) => message.id === outputMessageId);
    if (byId) return byId;
  }

  const expectedTopic = topicForAgent(agentType);
  return [...storedRun.messages]
    .reverse()
    .find(
      (message) =>
        message.source === agentType && message.topic === expectedTopic,
    );
}

function hydrateCompletedStepContext(
  storedRun: StoredAgentRun,
  context: AgentContext,
  agentType: AgentType,
): boolean {
  const message = findStepMessage(storedRun, agentType);

  switch (agentType) {
    case "scan": {
      const payload = isRecord(message?.payload) ? message.payload : undefined;
      const riskInput = riskInputFromWire(payload?.riskInput);
      if (!riskInput) return false;

      context.scan = {
        riskInput,
        sources: Array.isArray(payload?.sources) ? payload.sources : [],
        scan: {
          walletAddress: context.input.walletAddress,
          nfpmAddress: "0x0000000000000000000000000000000000000000",
          fromBlock: 0n,
          toBlock: 0n,
          transfers: [],
          candidateTokenIds: Array.isArray(payload?.currentlyOwnedTokenIds)
            ? payload.currentlyOwnedTokenIds.map((id) => BigInt(String(id)))
            : [],
          positions: [],
          currentlyOwnedTokenIds: Array.isArray(payload?.currentlyOwnedTokenIds)
            ? payload.currentlyOwnedTokenIds.map((id) => BigInt(String(id)))
            : [],
          movedOutTokenIds: [],
        },
        poolState: {
          positions: [],
          source: {
            status: "unavailable",
            reason: "Rehydrated from completed ScanAgent message.",
          },
        },
      } as unknown as WalletRiskInputResult;
      return true;
    }
    case "simulate": {
      const payload = isRecord(message?.payload) ? message.payload : undefined;
      const riskOutput = riskOutputFromWire(payload?.riskOutput);
      if (!riskOutput || !payload?.reportRoot) return false;

      context.diagnosis = {
        report: {
          rootHash: payload.reportRoot,
          payload: {
            riskOutput,
          },
        },
        attestationHash: payload.attestationHash,
        anchor: payload.anchor,
      } as AggregateRiskPipelineResult;
      return true;
    }
    case "optimize": {
      const payload = isRecord(message?.payload) ? message.payload : undefined;
      const proposal = isRecord(payload?.rebalanceProposal)
        ? payload.rebalanceProposal
        : undefined;
      if (!proposal?.proposalHash || !proposal?.reportRoot) return false;

      context.optimization = proposal as unknown as RebalanceProposalPreview;
      return true;
    }
    case "correlate":
    case "execute":
    case "monitor":
      return true;
  }
}

function topicForAgent(agent: AgentType): AgentTopic {
  switch (agent) {
    case "scan":
      return "positions.scanned";
    case "correlate":
      return "portfolio.correlated";
    case "simulate":
      return "portfolio.simulated";
    case "optimize":
      return "portfolio.optimized";
    case "execute":
      return "portfolio.executed";
    case "monitor":
      return "portfolio.alert";
    default:
      throw new Error(`Unknown agent type: ${agent}`);
  }
}

function normalizeForWire(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalizeForWire);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .map(([key, entry]) => [key, normalizeForWire(entry)]),
  );
}

interface TuringDecisionPreview {
  requested: boolean;
  status: "skipped" | "recorded" | "failed";
  txHash?: Hex;
  chainId?: number;
  registry?: Address;
  agentId?: string;
  decisionId?: string;
  action?: 0 | 1 | 2 | 3;
  scenarioHash?: Hex;
  reportHash?: Hex;
  error?: string;
  provenance: {
    label: "VERIFIED" | "UNAVAILABLE" | "EMULATED";
    source: string;
    degraded: boolean;
    warnings: string[];
    observedAt: number;
  };
}

interface TeeAnchorPreview {
  status: "skipped" | "anchored" | "failed";
  txHash?: Hex;
  chainId?: number;
  registry?: Address;
  decisionId?: string;
  attestationHash?: Hex;
  provider?: string;
  error?: string;
  provenance: {
    label: "VERIFIED" | "UNAVAILABLE" | "EMULATED";
    source: string;
    degraded: boolean;
    warnings: string[];
    observedAt: number;
  };
}

function scanPositionsForBeData(scan?: WalletRiskInputResult): unknown[] {
  const positions = normalizeForWire(scan?.scan.positions ?? []);
  return Array.isArray(positions) ? positions : [];
}

/** Unique lowercased token0/token1 addresses across a scan's positions. */
function uniqueTokenAddressesFromScan(scan?: WalletRiskInputResult): string[] {
  const seen = new Set<string>();
  for (const pos of scan?.scan.positions ?? []) {
    for (const addr of [pos.token0, pos.token1]) {
      if (addr) seen.add(addr.toLowerCase());
    }
  }
  return [...seen];
}

function stableStringify(value: unknown): string {
  return JSON.stringify(normalizeForWire(value), (_key, entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
    return Object.fromEntries(
      Object.entries(entry).sort(([left], [right]) => left.localeCompare(right)),
    );
  });
}

function riskActionName(value: 0 | 1 | 2): "hold" | "rebalance" | "close" {
  switch (value) {
    case 0:
      return "hold";
    case 1:
      return "rebalance";
    case 2:
      return "close";
  }
}

function turingActionForRiskAction(value: 0 | 1 | 2): 0 | 2 | 3 {
  switch (value) {
    case 0:
      return 0;
    case 1:
      return 2;
    case 2:
      return 3;
  }
}

function riskTierName(value: 0 | 1 | 2): "green" | "amber" | "red" {
  switch (value) {
    case 0:
      return "green";
    case 1:
      return "amber";
    case 2:
      return "red";
  }
}

function clampBigInt(value: bigint, min: bigint, max: bigint): bigint {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function buildActionPreviews(
  input: AgentOrchestrationInput,
  riskInput: PortfolioRiskInput | undefined,
  action: "hold" | "rebalance" | "close",
): RebalanceActionPreview[] {
  if (action === "hold") {
    return [
      {
        actionType: "monitor",
        sequence: 1,
        description: "Keep current allocation and continue autonomous monitoring.",
        estimatedGas: 0,
      },
    ];
  }

  const actions: RebalanceActionPreview[] = [];
  let sequence = 1;
  if ((riskInput?.dustPositions ?? 0n) > 0n || action === "close") {
    actions.push({
      actionType: "close",
      sequence,
      description:
        "Close or consolidate dust LP positions once the user approves a concrete Permit2 bundle.",
      sourceTokenId: input.tokenId,
      estimatedGas: 180_000,
    });
    sequence += 1;
  }

  if ((riskInput?.outOfRangePositions ?? 0n) > 0n || action === "rebalance") {
    actions.push({
      actionType: "rebalance",
      sequence,
      description:
        "Rebalance out-of-range liquidity into a healthier allocation preview.",
      sourceTokenId: input.tokenId,
      estimatedGas: 260_000,
    });
    sequence += 1;
  }

  if ((riskInput?.correlatedExposureBps ?? 0n) > 7_000n) {
    actions.push({
      actionType: "consolidate",
      sequence,
      description:
        "Reduce correlated pair exposure by consolidating positions into fewer lower-risk ranges.",
      estimatedGas: 220_000,
    });
  }

  return actions.length > 0 ? actions : [
    {
      actionType: "monitor",
      sequence: 1,
      description: "No executable action preview was generated; keep monitoring.",
      estimatedGas: 0,
    },
  ];
}

function buildRebalanceProposal(
  input: AgentOrchestrationInput,
  diagnosis: AggregateRiskPipelineResult,
  riskInput: PortfolioRiskInput | undefined,
): RebalanceProposalPreview {
  const riskOutput = diagnosis.report.payload.riskOutput;
  const recommendedAction = riskActionName(riskOutput.recommendedAction);
  const riskScoreBps = riskOutput.riskScoreBps;
  const concentrationBps = riskInput?.concentrationBps ?? 0n;
  const expectedRiskReductionBps =
    recommendedAction === "hold"
      ? 0n
      : clampBigInt(riskScoreBps / 3n, 250n, 2_500n);
  const actions = buildActionPreviews(input, riskInput, recommendedAction);
  const gasEstimate = actions.reduce((sum, action) => sum + action.estimatedGas, 0);
  const draft = {
    walletAddress: input.walletAddress,
    tokenId: input.tokenId,
    reportRoot: diagnosis.report.rootHash,
    recommendedAction,
    riskScoreBps,
    riskTier: riskOutput.riskTier,
    actions,
  };

  return {
    proposalHash: keccak256(toBytes(stableStringify(draft))),
    status: "preview",
    expiresAt: Date.now() + 15 * 60 * 1000,
    recommendedAction,
    expectedOutcome: {
      riskScoreBps,
      expectedRiskReductionBps,
      expectedRiskConcentrationBps:
        recommendedAction === "hold"
          ? concentrationBps
          : clampBigInt(concentrationBps - expectedRiskReductionBps, 0n, 10_000n),
    },
    cost: {
      gasEstimateUSD: gasEstimate === 0 ? 0 : Math.max(1, Math.round(gasEstimate / 100_000)),
      slippageEstimateBps: recommendedAction === "hold" ? 0 : 50,
    },
    actions,
    reportRoot: diagnosis.report.rootHash,
    simulationScenario: input.scenario ?? "baseline",
  };
}

function sequenceFor(target: AgentType): AgentType[] {
  switch (target) {
    case "scan":
      return ["scan"];
    case "correlate":
      return ["scan", "correlate"];
    case "simulate":
      return ["scan", "correlate", "simulate"];
    case "optimize":
      return ["scan", "correlate", "simulate", "optimize"];
    case "execute":
      return ["scan", "correlate", "simulate", "optimize", "execute"];
    case "monitor":
      return ["monitor"];
  }
}

abstract class PortfolioAgent {
  constructor(readonly type: AgentType) {}

  abstract run(context: AgentContext): Promise<unknown>;
}

class ScanAgent extends PortfolioAgent {
  constructor(private readonly portfolioService: PortfolioService) {
    super("scan");
  }

  async run(context: AgentContext): Promise<unknown> {
    const scan = await this.portfolioService.getWalletPositions(
      context.input.walletAddress,
    );
    context.scan = scan;

    return {
      externalAgent: externalAgentName(this.type),
      walletAddress: context.input.walletAddress,
      currentlyOwnedTokenIds: scan.scan.currentlyOwnedTokenIds.map((id) =>
        id.toString(),
      ),
      transferCount: scan.scan.transfers.length,
      positionCount: scan.scan.positions.length,
      riskInput: scan.riskInput,
      sources: scan.sources,
    };
  }
}

class CorrelateAgent extends PortfolioAgent {
  constructor(
    private readonly config: ServerConfig,
    private readonly beDataClient: BeDataClient,
  ) {
    super("correlate");
  }

  async run(context: AgentContext): Promise<unknown> {
    if (!context.scan) {
      throw new Error("CorrelateAgent requires ScanAgent output.");
    }

    // The TEE CVM cannot reach price APIs, so we fetch close series here (the
    // backend has egress) and pass them in as attested inputs; correlation is
    // still computed inside the enclave.
    const tokenAddresses = uniqueTokenAddressesFromScan(context.scan);
    const priceHistory = tokenAddresses.length
      ? await fetchMantlePriceHistory(this.config, tokenAddresses).catch(() => [])
      : [];

    const beDataCorrelation = await this.beDataClient.computeCorrelation({
      positions: scanPositionsForBeData(context.scan),
      priceHistory,
    });
    context.beDataCorrelation = beDataCorrelation;

    return {
      externalAgent: externalAgentName(this.type),
      method: "pair-exposure-bps",
      correlatedExposureBps: context.scan.riskInput.correlatedExposureBps,
      concentrationBps: context.scan.riskInput.concentrationBps,
      beData: {
        ok: beDataCorrelation.ok,
        data: beDataCorrelation.data,
        provenance: beDataCorrelation.provenance,
      },
      note:
        beDataCorrelation.ok
          ? "Correlation includes BE Data service output."
          : "Correlation falls back to pair exposure because BE Data service output is unavailable.",
    };
  }
}

function confidenceForTuringDecision(
  riskScoreBps: bigint,
  beDataOk: boolean,
): number {
  const base = beDataOk ? 7_500 : 5_500;
  const riskConfidence = Number(clampBigInt(riskScoreBps, 0n, 10_000n) / 20n);
  return Math.min(9_500, base + riskConfidence);
}

class SimulateAgent extends PortfolioAgent {
  constructor(
    private readonly portfolioService: PortfolioService,
    private readonly beDataClient: BeDataClient,
  ) {
    super("simulate");
  }

  async run(context: AgentContext): Promise<unknown> {
    const beDataSimulation = await this.beDataClient.computeSimulate({
      positions: scanPositionsForBeData(context.scan),
      scenarios: [context.input.scenario ?? "baseline"],
    });
    context.beDataSimulation = beDataSimulation;

    const diagnosis = await this.portfolioService.diagnose({
      walletAddress: context.input.walletAddress,
      tokenId: context.input.tokenId,
      riskInput: context.scan?.riskInput,
      riskInputSource: context.scan
        ? {
            name: "ScanAgent wallet-derived portfolio risk input",
            label: "COMPUTED",
            notes: [
              "SimulateAgent reused ScanAgent output to keep one correlationId-bound run.",
            ],
          }
        : undefined,
      publishReport: context.input.publishReport,
      requirePhala: context.input.requirePhala || context.input.requireTee,
      phalaAttestationHash:
        context.input.teeAttestationHash ?? context.input.phalaAttestationHash,
    });
    context.diagnosis = diagnosis;

    return {
      externalAgent: externalAgentName(this.type),
      scenario: context.input.scenario ?? "baseline",
      riskOutput: diagnosis.report.payload.riskOutput,
      reportRoot: diagnosis.report.rootHash,
      attestationHash: diagnosis.attestationHash,
      anchor: diagnosis.anchor,
      beData: {
        ok: beDataSimulation.ok,
        data: beDataSimulation.data,
        provenance: beDataSimulation.provenance,
      },
    };
  }
}

class OptimizeAgent extends PortfolioAgent {
  constructor(
    private readonly config: ServerConfig,
    private readonly beDataClient: BeDataClient,
  ) {
    super("optimize");
  }

  private async maybeRecordTuringDecision(
    context: AgentContext,
    proposal: RebalanceProposalPreview,
  ): Promise<TuringDecisionPreview> {
    const requested = Boolean(context.input.recordTuringDecision);
    const riskOutput = context.diagnosis?.report.payload.riskOutput;
    const reportHash = context.diagnosis?.report.rootHash;

    if (!requested) {
      return {
        requested,
        status: "skipped",
        provenance: {
          label: "EMULATED",
          source: "Mantle Turing Registry",
          degraded: false,
          warnings: ["recordTuringDecision was not requested for this run."],
          observedAt: Date.now(),
        },
      };
    }

    if (!this.config.turingAgentId || !riskOutput || !reportHash) {
      return {
        requested,
        status: "skipped",
        agentId: this.config.turingAgentId?.toString(),
        reportHash,
        provenance: {
          label: "UNAVAILABLE",
          source: "Mantle Turing Registry",
          degraded: true,
          warnings: [
            "Turing decision was requested, but LPGUARDIAN_TURING_AGENT_ID or report output is unavailable.",
          ],
          observedAt: Date.now(),
        },
      };
    }

    const scenarioHash = keccak256(toBytes(stableStringify({
      walletAddress: context.input.walletAddress,
      scenario: context.input.scenario ?? "baseline",
      proposalHash: proposal.proposalHash,
    })));
    const action = turingActionForRiskAction(riskOutput.recommendedAction);
    const confidenceBps = confidenceForTuringDecision(
      riskOutput.riskScoreBps,
      Boolean(context.beDataOptimization?.ok),
    );

    try {
      const result = await recordTuringDecision(this.config, {
        agentId: this.config.turingAgentId,
        subject: context.input.walletAddress,
        scenarioHash,
        reportHash,
        action,
        confidenceBps,
        riskScoreBps: Number(clampBigInt(riskOutput.riskScoreBps, 0n, 10_000n)),
        metadataURI: `lpguardian://proposal/${proposal.proposalHash}`,
      });

      return {
        requested,
        status: "recorded",
        txHash: result.txHash,
        chainId: result.chainId,
        registry: result.registry,
        agentId: this.config.turingAgentId.toString(),
        decisionId: result.id?.toString(),
        action,
        scenarioHash,
        reportHash,
        provenance: {
          label: "VERIFIED",
          source: "Mantle Turing Registry recordDecision",
          degraded: false,
          warnings: [],
          observedAt: Date.now(),
        },
      };
    } catch (error) {
      return {
        requested,
        status: "failed",
        agentId: this.config.turingAgentId.toString(),
        action,
        scenarioHash,
        reportHash,
        error: error instanceof Error ? error.message : String(error),
        provenance: {
          label: "UNAVAILABLE",
          source: "Mantle Turing Registry recordDecision",
          degraded: true,
          warnings: [
            error instanceof Error ? error.message : String(error),
          ],
          observedAt: Date.now(),
        },
      };
    }
  }

  private skippedTeeAnchor(warning: string, degraded: boolean): TeeAnchorPreview {
    return {
      status: "skipped",
      provenance: {
        label: degraded ? "UNAVAILABLE" : "EMULATED",
        source: "Mantle Turing Registry recordOutcome (TEE anchor)",
        degraded,
        warnings: [warning],
        observedAt: Date.now(),
      },
    };
  }

  private async maybeAnchorTeeAttestation(
    context: AgentContext,
    decision: TuringDecisionPreview,
    attestationHash: Hex | undefined,
    provider: string | undefined,
  ): Promise<TeeAnchorPreview> {
    if (!attestationHash) {
      return this.skippedTeeAnchor(
        "No verified TEE attestation available; nothing to anchor on-chain.",
        false,
      );
    }
    if (decision.status !== "recorded" || !decision.decisionId) {
      return this.skippedTeeAnchor(
        "No recorded Turing decision id to bind the TEE attestation to.",
        decision.status === "failed",
      );
    }

    const riskOutput = context.diagnosis?.report.payload.riskOutput;
    const scoreBps = riskOutput
      ? Number(clampBigInt(riskOutput.riskScoreBps, 0n, 10_000n))
      : 5_000;

    try {
      const result = await recordTuringOutcome(this.config, {
        decisionId: BigInt(decision.decisionId),
        // Forward-looking anchor at decision time: no realized PnL yet.
        pnlBps: 0n,
        scoreBps,
        outcomeHash: attestationHash,
        metadataURI: `lpguardian://tee-attestation/${provider ?? "unknown"}/${attestationHash}`,
      });

      return {
        status: "anchored",
        txHash: result.txHash,
        chainId: result.chainId,
        registry: result.registry,
        decisionId: decision.decisionId,
        attestationHash,
        provider,
        provenance: {
          label: "VERIFIED",
          source: "Mantle Turing Registry recordOutcome (TEE anchor)",
          degraded: false,
          warnings: [],
          observedAt: Date.now(),
        },
      };
    } catch (error) {
      return {
        status: "failed",
        decisionId: decision.decisionId,
        attestationHash,
        provider,
        error: error instanceof Error ? error.message : String(error),
        provenance: {
          label: "UNAVAILABLE",
          source: "Mantle Turing Registry recordOutcome (TEE anchor)",
          degraded: true,
          warnings: [error instanceof Error ? error.message : String(error)],
          observedAt: Date.now(),
        },
      };
    }
  }

  async run(context: AgentContext): Promise<unknown> {
    if (!context.diagnosis) {
      throw new Error("OptimizeAgent requires SimulateAgent output.");
    }

    const { riskOutput } = context.diagnosis.report.payload;
    const proposal = buildRebalanceProposal(
      context.input,
      context.diagnosis,
      context.scan?.riskInput,
    );
    context.optimization = proposal;
    const beDataOptimization = await this.beDataClient.computeOptimize({
      positions: scanPositionsForBeData(context.scan),
      correlation: context.beDataCorrelation?.data ?? {
        method: "pair-exposure-bps",
        correlatedExposureBps: context.scan?.riskInput.correlatedExposureBps,
        concentrationBps: context.scan?.riskInput.concentrationBps,
      },
      constraints: {
        dryRun: context.input.dryRun ?? true,
        userApproved: Boolean(context.input.userApproved),
        proposalHash: proposal.proposalHash,
      },
    });
    context.beDataOptimization = beDataOptimization;

    // BE Data TEE signing: bind the report hash + optimization output to a TEE
    // attestation. When the BE Data service runs inside an AWS Nitro enclave the
    // attestationHash is a real hardware quote hash; otherwise it is a
    // developer-key emulation. Including `attestationHash` in the payload makes
    // messageProvenance() mark this message VERIFIED automatically.
    const beDataTeeSign = await this.beDataClient.teeSign({
      inputData: scanPositionsForBeData(context.scan),
      outputData: beDataOptimization.data ?? null,
      reportHash: context.diagnosis.report.rootHash,
    });
    context.beDataTeeSign = beDataTeeSign;
    // Only a real hardware attestation (Phala TDX or AWS Nitro) marks the
    // message VERIFIED; developer-key / mock stays EMULATED.
    const verifiedTeeProvider =
      beDataTeeSign.data?.provider === "phala" ||
      beDataTeeSign.data?.provider === "aws-nitro";
    const teeAttestationHash =
      beDataTeeSign.ok && verifiedTeeProvider
        ? beDataTeeSign.data?.attestationHash
        : undefined;

    const turingDecision = await this.maybeRecordTuringDecision(context, proposal);
    // Anchor the TEE attestation on Mantle as a SIMULATED outcome bound to the
    // just-recorded decision (outcomeHash = attestation hash). This closes the
    // on-chain benchmark loop: AI decision -> TEE-attested outcome on Mantle.
    const teeAnchor = await this.maybeAnchorTeeAttestation(
      context,
      turingDecision,
      teeAttestationHash,
      beDataTeeSign.data?.provider,
    );

    return {
      externalAgent: externalAgentName(this.type),
      recommendedAction: riskActionName(riskOutput.recommendedAction),
      riskTierName: riskTierName(riskOutput.riskTier),
      riskScoreBps: riskOutput.riskScoreBps,
      riskTier: riskOutput.riskTier,
      proposalStatus: "preview",
      rebalanceProposal: proposal,
      reportRoot: context.diagnosis.report.rootHash,
      attestationHash: teeAttestationHash,
      beData: {
        ok: beDataOptimization.ok,
        data: beDataOptimization.data,
        provenance: beDataOptimization.provenance,
      },
      teeSign: {
        ok: beDataTeeSign.ok,
        data: beDataTeeSign.data,
        provenance: beDataTeeSign.provenance,
      },
      turingDecision,
      teeAnchor,
      note:
        beDataOptimization.ok
          ? "OptimizeAgent generated an approval-gated proposal with BE Data optimization output."
          : "OptimizeAgent generated a deterministic approval-gated proposal preview because BE Data optimization is unavailable.",
    };
  }
}

class ExecuteAgent extends PortfolioAgent {
  constructor() {
    super("execute");
  }

  async run(context: AgentContext): Promise<unknown> {
    const proposal = context.optimization;
    return {
      externalAgent: externalAgentName(this.type),
      status: context.input.userApproved ? "ready_for_execution_backend" : "waiting_for_user",
      dryRun: context.input.dryRun ?? true,
      userApproved: Boolean(context.input.userApproved),
      tokenId: context.input.tokenId,
      reportRoot: context.diagnosis?.report.rootHash,
      proposalHash: proposal?.proposalHash,
      proposalStatus: proposal ? "available" : "missing",
      actions: proposal?.actions ?? [],
      note: context.input.userApproved
        ? "User approval flag is present, but real Permit2 bundle submission is not wired in this build."
        : "Execution remains blocked until the user approves the proposal and signs the Permit2 flow.",
    };
  }
}

class MonitorAgent extends PortfolioAgent {
  constructor(
    private readonly config: ServerConfig,
    private readonly monitorService: MonitorService,
  ) {
    super("monitor");
  }

  private async maybeRecordOutcome(
    context: AgentContext,
    state: unknown,
  ): Promise<TuringDecisionPreview> {
    const requested = Boolean(context.input.recordTuringOutcome);
    if (!requested) {
      return {
        requested,
        status: "skipped",
        provenance: {
          label: "EMULATED",
          source: "Mantle Turing Registry",
          degraded: false,
          warnings: ["recordTuringOutcome was not requested for this run."],
          observedAt: Date.now(),
        },
      };
    }

    if (!context.input.turingDecisionId) {
      return {
        requested,
        status: "skipped",
        provenance: {
          label: "UNAVAILABLE",
          source: "Mantle Turing Registry recordOutcome",
          degraded: true,
          warnings: [
            "Turing outcome was requested, but turingDecisionId was not supplied.",
          ],
          observedAt: Date.now(),
        },
      };
    }

    const scoreBps = context.input.simulatedScoreBps ?? 5_000;
    const pnlBps = BigInt(context.input.simulatedPnlBps ?? "0");
    const outcomeHash = keccak256(toBytes(stableStringify({
      walletAddress: context.input.walletAddress,
      decisionId: context.input.turingDecisionId,
      pnlBps: pnlBps.toString(),
      scoreBps,
      state,
    })));

    try {
      const result = await recordTuringOutcome(this.config, {
        decisionId: BigInt(context.input.turingDecisionId),
        pnlBps,
        scoreBps,
        outcomeHash,
        metadataURI: `lpguardian://outcome/${outcomeHash}`,
      });

      return {
        requested,
        status: "recorded",
        txHash: result.txHash,
        chainId: result.chainId,
        registry: result.registry,
        reportHash: outcomeHash,
        provenance: {
          label: "VERIFIED",
          source: "Mantle Turing Registry recordOutcome",
          degraded: false,
          warnings: [],
          observedAt: Date.now(),
        },
      };
    } catch (error) {
      return {
        requested,
        status: "failed",
        reportHash: outcomeHash,
        error: error instanceof Error ? error.message : String(error),
        provenance: {
          label: "UNAVAILABLE",
          source: "Mantle Turing Registry recordOutcome",
          degraded: true,
          warnings: [
            error instanceof Error ? error.message : String(error),
          ],
          observedAt: Date.now(),
        },
      };
    }
  }

  async run(context: AgentContext): Promise<unknown> {
    const existing = this.monitorService.getWalletState(context.input.walletAddress);
    const state = existing ?? this.monitorService.watch(context.input.walletAddress);
    const turingOutcome = await this.maybeRecordOutcome(context, state);

    return {
      externalAgent: externalAgentName(this.type),
      ...state,
      turingOutcome,
    };
  }
}

export class AgentOrchestrator {
  private readonly portfolioService: PortfolioService;
  private readonly beDataClient: BeDataClient;
  private readonly agents: Record<AgentType, PortfolioAgent>;
  private readonly runs = new Map<string, StoredAgentRun>();
  private readonly messagesByCorrelationId = new Map<string, AgentMessage[]>();
  private readonly streamListeners = new Map<string, Set<AgentStreamListener>>();
  private readonly deadLetterListeners = new Set<AgentStreamListener>();
  private processing = false;

  constructor(
    config: ServerConfig,
    private readonly monitorService: MonitorService,
    private readonly stateStore: AgentStateRepository = new AgentStateStore(),
    private readonly queue: AgentRunQueue = new InMemoryAgentRunQueue(),
  ) {
    this.portfolioService = new PortfolioService(config);
    this.beDataClient = new BeDataClient(config);
    this.agents = {
      scan: new ScanAgent(this.portfolioService),
      correlate: new CorrelateAgent(config, this.beDataClient),
      simulate: new SimulateAgent(this.portfolioService, this.beDataClient),
      optimize: new OptimizeAgent(config, this.beDataClient),
      execute: new ExecuteAgent(),
      monitor: new MonitorAgent(config, monitorService),
    };

    for (const storedRun of this.stateStore.listRuns()) {
      if (storedRun.run.status === "queued" || storedRun.run.status === "running") {
        storedRun.run = {
          ...storedRun.run,
          status: "queued",
          completedAt: undefined,
        };
        this.queue.enqueue(storedRun.run.id);
        this.stateStore.putRun(storedRun);
      }
      this.runs.set(storedRun.run.id, storedRun);
      this.messagesByCorrelationId.set(
        storedRun.run.correlationId,
        storedRun.messages,
      );
    }
    this.processQueue();
  }

  listRuns(filter: ListRunsFilter = {}): StoredAgentRun[] {
    return this.stateStore.listRuns(filter);
  }

  listDeadLetters(filter: ListRunsFilter = {}): StoredAgentRun[] {
    return this.stateStore.listDeadLetters(filter);
  }

  getQueueSnapshot(): AgentRunQueueSnapshot {
    return this.queue.snapshot(this.processing);
  }

  getRun(runId: string): StoredAgentRun | undefined {
    return this.runs.get(runId) ?? this.stateStore.getRun(runId);
  }

  getRunByCorrelationId(correlationId: string): StoredAgentRun | undefined {
    return this.listRuns().find(
      (entry) => entry.run.correlationId === correlationId,
    );
  }

  retryDeadLetter(runId: string): AgentOrchestrationResult | undefined {
    const storedRun = this.getRun(runId);
    if (!storedRun?.meta?.deadLetter) return undefined;

    storedRun.messages = [];
    storedRun.run = {
      ...storedRun.run,
      status: "queued",
      completedAt: undefined,
      error: undefined,
    };
    storedRun.meta = {
      ...storedRun.meta,
      attempts: 0,
      nextAttemptAt: undefined,
      lastError: undefined,
      deadLetter: false,
      steps: undefined,
    };
    this.persistRun(storedRun);
    this.queue.enqueue(storedRun.run.id);
    this.emitRun(storedRun, "agent.run.queued");
    this.processQueue();

    return {
      run: storedRun.run,
      messages: storedRun.messages,
    };
  }

  getMessages(correlationId: string): AgentMessage[] {
    return (
      this.messagesByCorrelationId.get(correlationId) ??
      this.stateStore.getMessages(correlationId)
    );
  }

  subscribe(
    correlationId: string,
    listener: AgentStreamListener,
  ): () => void {
    const listeners = this.streamListeners.get(correlationId) ?? new Set();
    listeners.add(listener);
    this.streamListeners.set(correlationId, listeners);

    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.streamListeners.delete(correlationId);
      }
    };
  }

  subscribeDeadLetters(listener: AgentStreamListener): () => void {
    this.deadLetterListeners.add(listener);
    return () => {
      this.deadLetterListeners.delete(listener);
    };
  }

  enqueue(input: AgentOrchestrationInput): AgentOrchestrationResult {
    const idempotencyKey = idempotencyKeyFor(input);
    const existing = this.stateStore.getRunByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        run: existing.run,
        messages: existing.messages,
      };
    }

    const startedAt = Date.now();
    const targetAgent = input.targetAgent ?? "correlate";
    const run: AgentRun = {
      id: createId("run"),
      status: "queued",
      startedAt,
      currentAgent: targetAgent,
      correlationId: createId("correlation"),
    };
    const storedRun: StoredAgentRun = {
      input,
      run,
      messages: [],
      meta: {
        idempotencyKey,
        attempts: 0,
        maxAttempts: DEFAULT_MAX_ATTEMPTS,
      },
    };

    this.persistRun(storedRun);
    this.queue.enqueue(run.id);
    this.emitRun(storedRun, "agent.run.queued");
    this.processQueue();

    return {
      run,
      messages: [],
    };
  }

  async run(input: AgentOrchestrationInput): Promise<AgentOrchestrationResult> {
    const startedAt = Date.now();
    const targetAgent = input.targetAgent ?? "correlate";
    const storedRun: StoredAgentRun = {
      input,
      messages: [],
      run: {
        id: createId("run"),
        status: "running",
        startedAt,
        currentAgent: targetAgent,
        correlationId: createId("correlation"),
      },
      meta: {
        idempotencyKey: idempotencyKeyFor(input),
        attempts: 0,
        maxAttempts: 1,
      },
    };

    await this.executeStoredRun(storedRun);
    return {
      run: storedRun.run,
      messages: storedRun.messages,
    };
  }

  private processQueue(): void {
    if (this.processing) return;
    this.processing = true;

    setTimeout(() => {
      this.drainQueue().catch((error: unknown) => {
        console.error(`[AgentOrchestrator] Queue drain failed: ${String(error)}`);
      });
    }, 0);
  }

  private async drainQueue(): Promise<void> {
    try {
      while (this.queue.size() > 0) {
        const runId = this.queue.dequeue();
        if (!runId) continue;

        const storedRun = this.getRun(runId);
        if (!storedRun || storedRun.run.status !== "queued") continue;
        if (
          storedRun.meta?.nextAttemptAt &&
          storedRun.meta.nextAttemptAt > Date.now()
        ) {
          this.queue.enqueue(runId);
          const delay = storedRun.meta.nextAttemptAt - Date.now();
          setTimeout(() => this.processQueue(), delay);
          break;
        }

        storedRun.run = {
          ...storedRun.run,
          status: "running",
          completedAt: undefined,
        };
        this.persistRun(storedRun);
        this.emitRun(storedRun, "agent.run.running");
        await this.executeStoredRun(storedRun);
      }
    } finally {
      this.processing = false;
      if (this.queue.size() > 0) this.processQueue();
    }
  }

  private async executeStoredRun(storedRun: StoredAgentRun): Promise<void> {
    const targetAgent = storedRun.input.targetAgent ?? "correlate";
    const sequence = sequenceFor(targetAgent);
    const context: AgentContext = {
      input: storedRun.input,
      correlationId: storedRun.run.correlationId,
    };
    let currentAgent = storedRun.run.currentAgent;
    let status: AgentRunStatus = "completed";
    const meta = ensureMeta(storedRun, sequence);
    meta.attempts += 1;
    meta.nextAttemptAt = undefined;
    meta.lastError = undefined;
    meta.deadLetter = false;
    this.persistRun(storedRun);

    try {
      for (const agentType of sequence) {
        currentAgent = agentType;
        storedRun.run = {
          ...storedRun.run,
          status: "running",
          currentAgent,
        };
        this.persistRun(storedRun);
        this.emitRun(storedRun, "agent.run.running");

        const step = storedRun.meta?.steps?.[agentType];
        if (step?.status === "completed") {
          const hydrated = hydrateCompletedStepContext(storedRun, context, agentType);
          if (hydrated) {
            this.emit(storedRun.run.correlationId, {
              event: "agent.step.resumed",
              id: `${storedRun.run.id}:${agentType}:resumed`,
              data: {
                runId: storedRun.run.id,
                correlationId: storedRun.run.correlationId,
                agent: agentType,
                outputMessageId: step.outputMessageId,
              },
            });
          } else {
            meta.steps![agentType] = pendingStep(agentType);
            this.persistRun(storedRun);
          }
        }

        await this.executeAgentStep(storedRun, context, agentType);

        if (
          agentType === "execute" &&
          !storedRun.input.userApproved &&
          !(storedRun.input.dryRun === false)
        ) {
          status = "waiting_for_user";
        }
      }
    } catch (error) {
      status = "failed";
      const message = error instanceof Error ? error.message : String(error);
      this.appendMessage(storedRun, {
        id: createId("msg"),
        timestamp: Date.now(),
        source: currentAgent ?? targetAgent,
        target: "all",
        topic: "agent.failed",
        correlationId: storedRun.run.correlationId,
        payload: {
          message,
          retryable: true,
          attempt: storedRun.meta?.attempts ?? 0,
          maxAttempts: storedRun.meta?.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
          step: currentAgent ?? targetAgent,
          stepAttempts:
            storedRun.meta?.steps?.[currentAgent ?? targetAgent]?.attempts ?? 0,
          stepMaxAttempts:
            storedRun.meta?.steps?.[currentAgent ?? targetAgent]?.maxAttempts ??
            DEFAULT_STEP_MAX_ATTEMPTS,
        },
      });
      storedRun.meta = {
        ...ensureMeta(storedRun, sequence),
        lastError: message,
      };
    }

    if (
      status === "failed" &&
      storedRun.meta &&
      storedRun.meta.attempts < storedRun.meta.maxAttempts
    ) {
      const nextAttemptAt = Date.now() + retryDelayMs(storedRun.meta.attempts);
      storedRun.meta = {
        ...storedRun.meta,
        nextAttemptAt,
        deadLetter: false,
      };
      storedRun.run = {
        ...storedRun.run,
        status: "queued",
        completedAt: undefined,
        error: undefined,
      };
      this.persistRun(storedRun);
      this.queue.enqueue(storedRun.run.id);
      this.emit(storedRun.run.correlationId, {
        event: "agent.run.retry_scheduled",
        id: storedRun.run.id,
        data: {
          runId: storedRun.run.id,
          correlationId: storedRun.run.correlationId,
          attempt: storedRun.meta.attempts,
          maxAttempts: storedRun.meta.maxAttempts,
          nextAttemptAt,
        },
      });
      setTimeout(() => this.processQueue(), Math.max(0, nextAttemptAt - Date.now()));
      return;
    }

    const deadLetter = status === "failed";
    storedRun.run = {
      ...storedRun.run,
      status,
      completedAt: Date.now(),
      currentAgent,
      error:
        status === "failed"
          ? {
              code: "AGENT_RUN_FAILED",
              message: "Agent orchestration failed. Inspect messages for details.",
              retryable: true,
              source: currentAgent,
            }
          : undefined,
    };
    storedRun.meta = storedRun.meta
      ? {
          ...storedRun.meta,
          nextAttemptAt: undefined,
          deadLetter,
        }
      : undefined;
    this.persistRun(storedRun);
    this.emitRun(
      storedRun,
      status === "failed"
        ? "agent.run.dead_lettered"
        : "agent.run.completed",
    );
  }

  private async executeAgentStep(
    storedRun: StoredAgentRun,
    context: AgentContext,
    agentType: AgentType,
  ): Promise<void> {
    const meta = ensureMeta(storedRun, sequenceFor(storedRun.input.targetAgent ?? "correlate"));
    let step = meta.steps?.[agentType] ?? pendingStep(agentType);
    step = {
      ...step,
      agent: agentType,
      maxAttempts: step.maxAttempts || DEFAULT_STEP_MAX_ATTEMPTS,
    };
    meta.steps = {
      ...(meta.steps ?? {}),
      [agentType]: step,
    };

    if (step.status === "completed") {
      const hydrated = hydrateCompletedStepContext(storedRun, context, agentType);
      if (hydrated) return;

      step = pendingStep(agentType);
      meta.steps[agentType] = step;
      this.persistRun(storedRun);
    }

    while (step.attempts < step.maxAttempts) {
      step.status = "running";
      step.attempts += 1;
      step.startedAt = Date.now();
      step.completedAt = undefined;
      step.lastError = undefined;
      this.persistRun(storedRun);

      try {
        const payload = await this.agents[agentType].run(context);
        const provenanced = messageProvenance(context, agentType, payload);
        const message: AgentMessage = {
          id: createId("msg"),
          timestamp: Date.now(),
          source: agentType,
          target: "all",
          topic: topicForAgent(agentType),
          correlationId: storedRun.run.correlationId,
          payload: normalizeForWire(provenanced.payload),
          teeAttestation: provenanced.teeAttestation,
        };
        step.status = "completed";
        step.completedAt = Date.now();
        step.outputMessageId = message.id;
        this.appendMessage(storedRun, message);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        step.status = "failed";
        step.completedAt = Date.now();
        step.lastError = message;
        this.persistRun(storedRun);

        if (step.attempts >= step.maxAttempts) {
          throw error;
        }

        const nextAttemptAt = Date.now() + retryDelayMs(step.attempts);
        this.emit(storedRun.run.correlationId, {
          event: "agent.step.retry_scheduled",
          id: `${storedRun.run.id}:${agentType}:${step.attempts}`,
          data: {
            runId: storedRun.run.id,
            correlationId: storedRun.run.correlationId,
            agent: agentType,
            attempt: step.attempts,
            maxAttempts: step.maxAttempts,
            nextAttemptAt,
            error: message,
          },
        });
        await wait(Math.max(0, nextAttemptAt - Date.now()));
      }
    }
  }

  private appendMessage(storedRun: StoredAgentRun, message: AgentMessage): void {
    storedRun.messages.push(message);
    this.persistRun(storedRun);
    this.emit(storedRun.run.correlationId, {
      event: message.topic,
      id: message.id,
      data: message,
    });
  }

  private persistRun(storedRun: StoredAgentRun): void {
    this.runs.set(storedRun.run.id, storedRun);
    this.messagesByCorrelationId.set(
      storedRun.run.correlationId,
      storedRun.messages,
    );
    this.stateStore.putRun(storedRun);
  }

  private emitRun(storedRun: StoredAgentRun, event: string): void {
    const streamEvent = {
      event,
      id: storedRun.run.id,
      data: storedRun.run,
    };
    this.emit(storedRun.run.correlationId, streamEvent);
    if (event === "agent.run.dead_lettered") {
      this.emitDeadLetter(streamEvent);
    }
  }

  private emit(correlationId: string, event: AgentStreamEvent): void {
    const listeners = this.streamListeners.get(correlationId);
    if (!listeners) return;
    for (const listener of listeners) {
      listener(event);
    }
  }

  private emitDeadLetter(event: AgentStreamEvent): void {
    for (const listener of this.deadLetterListeners) {
      listener(event);
    }
  }
}

/**
 * Compatibility helper used by the existing runtime endpoint. It remains
 * lightweight and deterministic while the full AgentOrchestrator powers the
 * portfolio MCP tools and orchestration endpoints.
 */
export function runFoundationAgents(
  options: FoundationAgentRunOptions,
): FoundationAgentRunResult {
  const startedAt = Date.now();
  const correlationId = options.correlationId ?? createId("correlation");
  const activeAgents: AgentType[] = ["scan", "correlate", "simulate"];

  const messages: AgentMessage[] = activeAgents.map((agent) => ({
    id: createId("msg"),
    timestamp: Date.now(),
    source: agent,
    target: "all",
    topic: topicForAgent(agent),
    correlationId,
    payload: {
      mode: options.mode,
      note: options.note(agent),
      processedAt: new Date().toISOString(),
    },
  }));

  return {
    run: {
      id: createId("run"),
      status: "completed",
      startedAt,
      completedAt: Date.now(),
      currentAgent: activeAgents[activeAgents.length - 1],
      correlationId,
    },
    messages,
  };
}

export function runMockFoundationAgents(): FoundationAgentRunResult {
  return runFoundationAgents({
    mode: "mock",
    note: (agent) => `${agent} agent performed its analysis using cached/mock datasets.`,
  });
}

export function runElizaFoundationAgents(): FoundationAgentRunResult {
  return runFoundationAgents({
    mode: "eliza",
    note: (agent) =>
      `${agent} agent collaborated via the ElizaOS runtime bridge to produce strategic findings.`,
  });
}
