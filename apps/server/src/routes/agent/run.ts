import { Hono } from "hono";
import { fail, ok } from "../../http/responses.js";
import { foundationRunRequestSchema } from "../../schemas/agent.js";
import type { AgentRuntime } from "../../services/agentRuntime/index.js";

export function createAgentFoundationRunRoute(runtime: AgentRuntime): Hono {
  const route = new Hono();

  route.get("/", async (c) => {
    const result = await runtime.runFoundation();

    return c.json(ok(result));
  });

  route.post("/", async (c) => {
    const body = await c.req.json().catch(() => null);
    const parsed = foundationRunRequestSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        fail(
          "INVALID_AGENT_RUN_REQUEST",
          "Invalid agent run request",
          parsed.error.issues,
        ),
        400,
      );
    }

    const result = await runtime.runFoundation(parsed.data);

    return c.json(ok(result));
  });

  return route;
}
