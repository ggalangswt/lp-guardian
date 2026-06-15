import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../app.js";
import { loadConfig, loadLocalEnv } from "../config.js";
import { AgentStateStore } from "../services/agentStateStore.js";
import type { StoredAgentRun } from "../services/agentOrchestrator.js";

loadLocalEnv();

mkdirSync(".lp-guardian", { recursive: true });
process.env.LPGUARDIAN_AGENT_STATE_FILE = join(
  ".lp-guardian",
  `smoke-agent-reliability-${Date.now()}.json`,
);
process.env.AGENT_RUNTIME = "mock";
process.env.STRATEGIST_PROVIDER = "mock";

const app = createApp(loadConfig());
const walletAddress = "0x0000000000000000000000000000000000000000";
const idempotencyKey = `smoke-agent-reliability-${Date.now()}`;

async function json(response: Response): Promise<any> {
  return response.json();
}

async function readFirstSseEvent(response: Response): Promise<string> {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type")?.includes("text/event-stream"), true);

  const reader = response.body?.getReader();
  assert.ok(reader);

  try {
    const decoder = new TextDecoder();
    let buffer = "";
    for (let index = 0; index < 5; index += 1) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.includes("\n\n")) return buffer;
    }

    return buffer;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function waitForCompletedRun(targetApp: typeof app, runId: string): Promise<any> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await targetApp.request(`/agent/orchestration/run/${runId}`);
    assert.equal(response.status, 200);
    const body = await json(response);
    const run = body.data;
    if (run.run.status === "completed") return run;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  throw new Error(`Run ${runId} did not complete.`);
}

const watchResponse = await app.request(`/agent/monitor/${walletAddress}/watch`, {
  method: "POST",
});
assert.equal(watchResponse.status, 200);
const monitorStream = await app.request(`/agent/monitor/${walletAddress}/stream`);
const monitorEvent = await readFirstSseEvent(monitorStream);
assert.equal(monitorEvent.includes("event: monitor.wallet.snapshot"), true);

const enqueueBody = {
  walletAddress,
  targetAgent: "monitor",
  idempotencyKey,
};
const firstEnqueue = await app.request("/agent/orchestration/runs", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(enqueueBody),
});
assert.equal(firstEnqueue.status, 202);
const firstBody = await json(firstEnqueue);

const secondEnqueue = await app.request("/agent/orchestration/runs", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(enqueueBody),
});
assert.equal(secondEnqueue.status, 202);
const secondBody = await json(secondEnqueue);
assert.equal(firstBody.data.run.id, secondBody.data.run.id);

const storedRun = await waitForCompletedRun(app, firstBody.data.run.id);
assert.equal(storedRun.meta.steps.monitor.status, "completed");
assert.equal(storedRun.meta.steps.monitor.attempts, 1);

const messagesResponse = await app.request(
  `/agent/orchestration/messages/${storedRun.run.correlationId}`,
);
assert.equal(messagesResponse.status, 200);
const messagesBody = await json(messagesResponse);
assert.equal(messagesBody.data.messages.length > 0, true);
assert.equal(
  messagesBody.data.messages[0].payload.agentProvenance.tee.label,
  "EMULATED",
);
assert.equal(messagesBody.data.messages[0].teeAttestation, undefined);

const verifiedAttestationHash = `0x${"1".repeat(64)}`;
const verifiedRunResponse = await app.request("/agent/orchestration/run", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    walletAddress,
    targetAgent: "monitor",
    idempotencyKey: `verified-provenance-${idempotencyKey}`,
    phalaAttestationHash: verifiedAttestationHash,
  }),
});
assert.equal(verifiedRunResponse.status, 200);
const verifiedRunBody = await json(verifiedRunResponse);
assert.equal(
  verifiedRunBody.data.messages[0].payload.agentProvenance.tee.label,
  "VERIFIED",
);
assert.equal(verifiedRunBody.data.messages[0].teeAttestation, verifiedAttestationHash);

const runStream = await app.request(
  `/agent/orchestration/stream/${storedRun.run.correlationId}`,
);
const runStreamBody = await runStream.text();
assert.equal(runStreamBody.includes("event: stream.complete"), true);

const runsResponse = await app.request(
  `/agent/orchestration/runs?walletAddress=${walletAddress}&targetAgent=monitor`,
);
assert.equal(runsResponse.status, 200);
const runsBody = await json(runsResponse);
assert.equal(runsBody.data.runs.length >= 1, true);

const queueResponse = await app.request("/agent/orchestration/queue");
assert.equal(queueResponse.status, 200);
const queueBody = await json(queueResponse);
assert.equal(queueBody.data.provider, "in-memory");
assert.equal(typeof queueBody.data.pendingCount, "number");
assert.equal(typeof queueBody.data.processing, "boolean");

const deadLetterResponse = await app.request("/agent/orchestration/dead-letter");
assert.equal(deadLetterResponse.status, 200);
const deadLetterBody = await json(deadLetterResponse);
assert.equal(Array.isArray(deadLetterBody.data.runs), true);

const deadLetterStream = await app.request("/agent/orchestration/dead-letter/stream");
assert.equal(deadLetterStream.status, 200);
assert.equal(
  deadLetterStream.headers.get("content-type")?.includes("text/event-stream"),
  true,
);
await deadLetterStream.body?.cancel().catch(() => undefined);

const resumeStore = new AgentStateStore(
  join(".lp-guardian", `smoke-agent-resume-${Date.now()}.json`),
);
const resumeRunId = `run__resume__${Date.now()}`;
const resumeCorrelationId = `correlation__resume__${Date.now()}`;
const resumeMessageId = `msg__resume__${Date.now()}`;
const startedAt = Date.now();
const resumeRun: StoredAgentRun = {
  input: {
    walletAddress,
    targetAgent: "monitor",
    idempotencyKey: `resume-${idempotencyKey}`,
  },
  run: {
    id: resumeRunId,
    status: "queued",
    startedAt,
    currentAgent: "monitor",
    correlationId: resumeCorrelationId,
  },
  messages: [
    {
      id: resumeMessageId,
      timestamp: startedAt,
      source: "monitor",
      target: "all",
      topic: "portfolio.alert",
      correlationId: resumeCorrelationId,
      payload: {
        walletAddress,
        status: "unknown",
        watched: true,
        resumedFromSmoke: true,
      },
    },
  ],
  meta: {
    idempotencyKey: `resume-${idempotencyKey}`,
    attempts: 0,
    maxAttempts: 3,
    steps: {
      monitor: {
        agent: "monitor",
        status: "completed",
        attempts: 1,
        maxAttempts: 2,
        startedAt,
        completedAt: startedAt,
        outputMessageId: resumeMessageId,
      },
    },
  },
};
resumeStore.putRun(resumeRun);
const resumeApp = createApp(loadConfig(), {
  agentStateStore: resumeStore,
});
const resumedRun = await waitForCompletedRun(resumeApp, resumeRunId);
assert.equal(resumedRun.run.status, "completed");
assert.equal(resumedRun.meta.steps.monitor.status, "completed");
assert.equal(resumedRun.meta.steps.monitor.attempts, 1);
assert.equal(resumedRun.messages.length, 1);

const optimizeStore = new AgentStateStore(
  join(".lp-guardian", `smoke-agent-optimize-${Date.now()}.json`),
);
const optimizeRunId = `run__optimize__${Date.now()}`;
const optimizeCorrelationId = `correlation__optimize__${Date.now()}`;
const optimizeStartedAt = Date.now();
const scanMessageId = `msg__scan__${Date.now()}`;
const correlateMessageId = `msg__correlate__${Date.now()}`;
const simulateMessageId = `msg__simulate__${Date.now()}`;
const reportRoot = `0x${"2".repeat(64)}`;
const optimizeRun: StoredAgentRun = {
  input: {
    walletAddress,
    targetAgent: "optimize",
    idempotencyKey: `optimize-${idempotencyKey}`,
  },
  run: {
    id: optimizeRunId,
    status: "queued",
    startedAt: optimizeStartedAt,
    currentAgent: "optimize",
    correlationId: optimizeCorrelationId,
  },
  messages: [
    {
      id: scanMessageId,
      timestamp: optimizeStartedAt,
      source: "scan",
      target: "all",
      topic: "positions.scanned",
      correlationId: optimizeCorrelationId,
      payload: {
        walletAddress,
        currentlyOwnedTokenIds: ["605313"],
        riskInput: {
          totalPositions: "3",
          outOfRangePositions: "1",
          dustPositions: "1",
          correlatedExposureBps: "8200",
          concentrationBps: "7600",
        },
        sources: [],
      },
    },
    {
      id: correlateMessageId,
      timestamp: optimizeStartedAt,
      source: "correlate",
      target: "all",
      topic: "portfolio.correlated",
      correlationId: optimizeCorrelationId,
      payload: {
        correlatedExposureBps: "8200",
      },
    },
    {
      id: simulateMessageId,
      timestamp: optimizeStartedAt,
      source: "simulate",
      target: "all",
      topic: "portfolio.simulated",
      correlationId: optimizeCorrelationId,
      payload: {
        scenario: "baseline",
        riskOutput: {
          riskScoreBps: "8100",
          riskTier: 2,
          recommendedAction: 1,
        },
        reportRoot,
      },
    },
  ],
  meta: {
    idempotencyKey: `optimize-${idempotencyKey}`,
    attempts: 0,
    maxAttempts: 3,
    steps: {
      scan: {
        agent: "scan",
        status: "completed",
        attempts: 1,
        maxAttempts: 2,
        outputMessageId: scanMessageId,
      },
      correlate: {
        agent: "correlate",
        status: "completed",
        attempts: 1,
        maxAttempts: 2,
        outputMessageId: correlateMessageId,
      },
      simulate: {
        agent: "simulate",
        status: "completed",
        attempts: 1,
        maxAttempts: 2,
        outputMessageId: simulateMessageId,
      },
    },
  },
};
optimizeStore.putRun(optimizeRun);
const optimizeApp = createApp(loadConfig(), {
  agentStateStore: optimizeStore,
});
const optimizedRun = await waitForCompletedRun(optimizeApp, optimizeRunId);
const optimizeMessage = optimizedRun.messages.find(
  (message: any) => message.source === "optimize",
);
assert.ok(optimizeMessage);
assert.equal(optimizeMessage.payload.rebalanceProposal.status, "preview");
assert.equal(
  /^0x[a-fA-F0-9]{64}$/.test(optimizeMessage.payload.rebalanceProposal.proposalHash),
  true,
);
assert.equal(optimizeMessage.payload.rebalanceProposal.actions.length > 0, true);

console.log(JSON.stringify({
  assertions: {
    monitorWalletStream: true,
    idempotentEnqueue: true,
    stepProgress: true,
    messageProvenance: true,
    completedRunLookup: true,
    orchestrationStreamReplay: true,
    queueSnapshot: true,
    deadLetterList: true,
    deadLetterStream: true,
    restartResumeSkipsCompletedStep: true,
    optimizeProposalPreview: true,
  },
  runId: storedRun.run.id,
  correlationId: storedRun.run.correlationId,
}));
