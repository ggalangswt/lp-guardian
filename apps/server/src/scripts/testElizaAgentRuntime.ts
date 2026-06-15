import assert from "node:assert/strict";
import { createApp } from "../app.js";
import { loadConfig, loadLocalEnv } from "../config.js";

loadLocalEnv();
process.env.AGENT_RUNTIME = "eliza";
process.env.STRATEGIST_PROVIDER = "eliza";
process.env.GEMINI_API_KEY = "";
process.env.GEMINI_MODEL = "gemini-1.5-flash";

const app = createApp(loadConfig());

const scenarios = [
  { scenario: "basic", recommendation: "monitor" },
  { scenario: "dust-and-correlation", recommendation: "migrate" },
  { scenario: "tee-unavailable", recommendation: "monitor" },
] as const;

for (const item of scenarios) {
  const response = await app.request("/agent/foundation/run", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      walletAddress: "0x0000000000000000000000000000000000000000",
      scenario: item.scenario,
    }),
  });

  assert.equal(response.status, 200);

  const body = await response.json();
  const payload = body.data?.messages?.[0]?.payload;
  const advice = body.data?.strategistAdvice;

  assert.equal(payload?.mode, "eliza");
  assert.equal(payload?.runtime?.provider, "eliza");
  assert.equal(payload?.runtime?.character, "LP_Guardian_Agent");
  assert.equal(payload?.strategist?.provider, "eliza");
  assert.equal(advice?.recommendation, item.recommendation);
  assert.equal(advice?.source?.provider, "eliza");
  assert.equal(advice?.source?.label, "EMULATED");
  assert.equal(advice?.source?.modelProvider, "deterministic");
  assert.equal(
    advice?.source?.modelName,
    "lp-guardian-deterministic-eliza-action",
  );
  assert.equal(advice?.source?.modelBacked, false);
  assert.equal(advice?.source?.actionName, "SUMMARIZE_LP_RISK");
}

console.log(JSON.stringify({
  scenarios: scenarios.map((item) => item.scenario),
  assertions: {
    status: 200,
    mode: "eliza",
    runtimeProvider: "eliza",
    strategistProvider: "eliza",
    modelProvider: "deterministic",
    modelName: "lp-guardian-deterministic-eliza-action",
    modelBacked: false,
    actionName: "SUMMARIZE_LP_RISK",
  },
}));
