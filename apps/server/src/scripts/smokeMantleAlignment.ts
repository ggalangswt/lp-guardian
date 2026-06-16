import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { loadConfig, loadLocalEnv } from "../config.js";

loadLocalEnv();

process.env.LPGUARDIAN_CHAIN_MODE = "mantle";
process.env.MANTLE_CHAIN_ID = "5003";
process.env.MANTLE_TURING_REGISTRY =
  "0x3338C6C85399e9E9d28233a186643a5383C6c736";
process.env.LPGUARDIAN_TURING_AGENT_ID = "";
process.env.BE_DATA_SERVICE_URL = "";
process.env.MERCHANT_MOE_SUBGRAPH_URL = "";
process.env.LPGUARDIAN_PERMIT2_BUNDLER = "";
process.env.LPGUARDIAN_TEE_ANCHOR = "";
process.env.AGENT_RUNTIME = "mock";
process.env.STRATEGIST_PROVIDER = "mock";

const app = createApp(loadConfig());
const walletAddress = "0x0000000000000000000000000000000000000000";
const proposalHash = `0x${"1".repeat(64)}`;

async function json(response: Response): Promise<any> {
  return response.json();
}

const runtimeResponse = await app.request("/agent/runtime");
assert.equal(runtimeResponse.status, 200);
const runtimeBody = await json(runtimeResponse);
assert.equal(runtimeBody.data.mantleReady, true);
assert.equal(runtimeBody.data.turingAgentReady, false);
assert.equal(runtimeBody.data.beDataReady, false);
assert.equal(runtimeBody.data.merchantMoeReady, false);
assert.equal(runtimeBody.data.executionReady, false);
assert.equal(runtimeBody.data.teeAnchorReady, false);

const discoveryResponse = await app.request("/.well-known/mcp-server");
assert.equal(discoveryResponse.status, 200);
const discoveryBody = await json(discoveryResponse);
assert.equal(discoveryBody.data.chainMode, "mantle");
assert.equal(discoveryBody.data.chainId, 5003);
assert.equal(discoveryBody.data.byrealSkillsPath, "/agent/skills/byreal");
assert.equal(discoveryBody.data.tools.includes("portfolio_execute"), true);

const skillsResponse = await app.request("/agent/skills/byreal");
assert.equal(skillsResponse.status, 200);
const skillsBody = await json(skillsResponse);
assert.equal(skillsBody.data.namespace, "lpguardian");
assert.deepEqual(
  skillsBody.data.skills.map((skill: { name: string }) => skill.name),
  ["scout", "strategist", "executor", "sentinel"],
);

const positionsResponse = await app.request(
  `/api/portfolio/${walletAddress}/positions`,
);
assert.equal(positionsResponse.status, 200);
const positionsBody = await json(positionsResponse);
assert.equal(positionsBody.data.source, "merchant-moe");
assert.equal(positionsBody.data.chainId, 5003);
assert.equal(positionsBody.data.positions.length, 0);
assert.equal(positionsBody.data.portfolioRiskInput.totalPositions, "0");
assert.equal(positionsBody.data.sources[0].label, "UNAVAILABLE");

const publicDiagnoseResponse = await app.request("/portfolio/diagnose", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    walletAddress,
    protocols: ["merchant-moe"],
  }),
});
assert.equal(publicDiagnoseResponse.status, 202);
const publicDiagnoseBody = await json(publicDiagnoseResponse);
assert.equal(publicDiagnoseBody.data.status, "queued");
assert.equal(typeof publicDiagnoseBody.data.correlationId, "string");
assert.equal(
  publicDiagnoseBody.data.streamUrl,
  `/agent/orchestration/stream/${publicDiagnoseBody.data.correlationId}`,
);

const legacyDiagnoseResponse = await app.request("/api/portfolio/diagnose", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    walletAddress,
    riskInput: {
      totalPositions: "2",
      outOfRangePositions: "1",
      dustPositions: "0",
      correlatedExposureBps: "7000",
      concentrationBps: "6500",
    },
    riskInputSource: {
      name: "smoke supplied Mantle aggregate",
      label: "COMPUTED",
    },
  }),
});
assert.equal(legacyDiagnoseResponse.status, 200);
const legacyDiagnoseBody = await json(legacyDiagnoseResponse);
assert.equal(legacyDiagnoseBody.data.report.payload.chainId, 5003);
assert.equal(
  legacyDiagnoseBody.data.report.payload.sources.at(-1).label,
  "COMPUTED",
);
assert.equal(legacyDiagnoseBody.data.anchor.status, "skipped");

const executePreviewResponse = await app.request("/api/portfolio/execute", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    walletAddress,
    proposalHash,
    dryRun: true,
    userApproved: false,
  }),
});
assert.equal(executePreviewResponse.status, 200);
const executePreviewBody = await json(executePreviewResponse);
assert.equal(executePreviewBody.data.status, "preview");
assert.equal(executePreviewBody.data.txHash, undefined);

const executeDisabledResponse = await app.request("/api/portfolio/execute", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    walletAddress,
    proposalHash,
    dryRun: false,
    userApproved: true,
    permit2Signature: "0x1234",
  }),
});
assert.equal(executeDisabledResponse.status, 409);
const executeDisabledBody = await json(executeDisabledResponse);
assert.equal(executeDisabledBody.data.status, "disabled");
assert.equal(executeDisabledBody.data.txHash, undefined);

const monitorOutcomeSkipResponse = await app.request("/agent/orchestration/run", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    walletAddress,
    targetAgent: "monitor",
    recordTuringOutcome: true,
  }),
});
assert.equal(monitorOutcomeSkipResponse.status, 200);
const monitorOutcomeSkipBody = await json(monitorOutcomeSkipResponse);
const monitorPayload = monitorOutcomeSkipBody.data.messages[0].payload;
assert.equal(monitorPayload.externalAgent, "Sentinel");
assert.equal(monitorPayload.turingOutcome.status, "skipped");
assert.equal(monitorPayload.turingOutcome.provenance.label, "UNAVAILABLE");
assert.equal(
  monitorPayload.agentProvenance.externalAgent,
  "Sentinel",
);

console.log(JSON.stringify({
  status: "ok",
  assertions: {
    mantleRuntime: true,
    discovery: true,
    byrealSkills: true,
    merchantMoeDegradedScout: true,
    publicPortfolioDiagnoseQueued: true,
    mantleLegacyDiagnoseOffchain: true,
    executorPreviewDisabled: true,
    sentinelOutcomeSkip: true,
  },
}));

process.exit(0);
