import { Hono } from "hono";
import { z } from "zod";
import type { Address, Hex } from "viem";
import type { ServerConfig } from "../config.js";
import { fail, ok } from "../http/responses.js";
import {
  getTuringAgentStats,
  getTuringDecision,
  recordTuringDecision,
  recordTuringOutcome,
  registerTuringAgent,
} from "../chain/turingRegistry.js";

const bytes32 = z.string().regex(/^0x[a-fA-F0-9]{64}$/);
const address = z.string().regex(/^0x[a-fA-F0-9]{40}$/);
const uintString = z.string().regex(/^\d+$/);
const bps = z.number().int().min(0).max(10_000);

function toJsonSafe(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(toJsonSafe);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, toJsonSafe(entry)]),
  );
}

export function createTuringRoute(config: ServerConfig): Hono {
  const route = new Hono();

  route.get("/config", (c) => c.json(ok({
    chainMode: config.chainMode,
    chainId: config.mantleChainId,
    registry: config.turingRegistryAddress,
  })));

  route.post("/agent/register", async (c) => {
    const schema = z.object({
      agentURI: z.string().default(""),
      codeHash: bytes32,
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json(fail("BAD_REQUEST", "Invalid agent registration payload", parsed.error.issues), 400);

    try {
      const result = await registerTuringAgent(config, {
        agentURI: parsed.data.agentURI,
        codeHash: parsed.data.codeHash as Hex,
      });
      return c.json(ok(result), 202);
    } catch (err) {
      return c.json(fail("TURING_REGISTER_FAILED", String(err)), 500);
    }
  });

  route.post("/decision", async (c) => {
    const schema = z.object({
      agentId: uintString,
      subject: address,
      scenarioHash: bytes32,
      reportHash: bytes32,
      action: z.number().int().min(0).max(255),
      confidenceBps: bps,
      riskScoreBps: bps,
      metadataURI: z.string().default(""),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json(fail("BAD_REQUEST", "Invalid decision payload", parsed.error.issues), 400);

    try {
      const result = await recordTuringDecision(config, {
        agentId: BigInt(parsed.data.agentId),
        subject: parsed.data.subject as Address,
        scenarioHash: parsed.data.scenarioHash as Hex,
        reportHash: parsed.data.reportHash as Hex,
        action: parsed.data.action,
        confidenceBps: parsed.data.confidenceBps,
        riskScoreBps: parsed.data.riskScoreBps,
        metadataURI: parsed.data.metadataURI,
      });
      return c.json(ok(toJsonSafe(result)), 202);
    } catch (err) {
      return c.json(fail("TURING_DECISION_FAILED", String(err)), 500);
    }
  });

  route.post("/outcome", async (c) => {
    const schema = z.object({
      decisionId: uintString,
      pnlBps: z.string().regex(/^-?\d+$/),
      scoreBps: bps,
      outcomeHash: bytes32,
      metadataURI: z.string().default(""),
    });
    const parsed = schema.safeParse(await c.req.json().catch(() => undefined));
    if (!parsed.success) return c.json(fail("BAD_REQUEST", "Invalid outcome payload", parsed.error.issues), 400);

    try {
      const result = await recordTuringOutcome(config, {
        decisionId: BigInt(parsed.data.decisionId),
        pnlBps: BigInt(parsed.data.pnlBps),
        scoreBps: parsed.data.scoreBps,
        outcomeHash: parsed.data.outcomeHash as Hex,
        metadataURI: parsed.data.metadataURI,
      });
      return c.json(ok(toJsonSafe(result)), 202);
    } catch (err) {
      return c.json(fail("TURING_OUTCOME_FAILED", String(err)), 500);
    }
  });

  route.get("/agent/:agentId", async (c) => {
    const parsed = uintString.safeParse(c.req.param("agentId"));
    if (!parsed.success) return c.json(fail("BAD_REQUEST", "agentId must be an unsigned integer."), 400);

    try {
      const result = await getTuringAgentStats(config, BigInt(parsed.data));
      return c.json(ok(toJsonSafe(result)));
    } catch (err) {
      return c.json(fail("TURING_AGENT_READ_FAILED", String(err)), 500);
    }
  });

  route.get("/decision/:decisionId", async (c) => {
    const parsed = uintString.safeParse(c.req.param("decisionId"));
    if (!parsed.success) return c.json(fail("BAD_REQUEST", "decisionId must be an unsigned integer."), 400);

    try {
      const result = await getTuringDecision(config, BigInt(parsed.data));
      return c.json(ok(toJsonSafe(result)));
    } catch (err) {
      return c.json(fail("TURING_DECISION_READ_FAILED", String(err)), 500);
    }
  });

  return route;
}
