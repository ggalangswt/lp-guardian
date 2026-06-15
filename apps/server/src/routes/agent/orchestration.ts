import { Hono } from "hono";
import type { Context } from "hono";
import type { AgentRunStatus, AgentType } from "@lp-guardian/core";
import type { Address, Hex } from "viem";
import { z } from "zod";
import { fail, ok } from "../../http/responses.js";
import type {
  AgentOrchestrationInput,
  AgentOrchestrator,
} from "../../services/agentOrchestrator.js";

const orchestrationRunSchema = z.object({
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/, "walletAddress must be an EVM address"),
  tokenId: z.string().regex(/^\d+$/, "tokenId must be an unsigned integer string").optional(),
  scenario: z.string().optional(),
  idempotencyKey: z.string().min(1).max(160).optional(),
  targetAgent: z
    .enum(["scan", "correlate", "simulate", "optimize", "execute", "monitor"])
    .default("correlate"),
  dryRun: z.boolean().default(true),
  userApproved: z.boolean().default(false),
  publishReport: z.boolean().default(false),
  requirePhala: z.boolean().default(false),
  phalaAttestationHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/, "phalaAttestationHash must be bytes32")
    .optional(),
});

function toInput(value: z.infer<typeof orchestrationRunSchema>): AgentOrchestrationInput {
  return {
    ...value,
    walletAddress: value.walletAddress as Address,
    phalaAttestationHash: value.phalaAttestationHash as Hex | undefined,
  };
}

function isTerminalStatus(status: AgentRunStatus): boolean {
  return ["waiting_for_user", "completed", "failed", "cancelled"].includes(status);
}

function encodeSse(event: string, data: unknown, id?: string): string {
  return [
    `event: ${event}`,
    ...(id ? [`id: ${id}`] : []),
    `data: ${JSON.stringify(data)}`,
  ].join("\n") + "\n\n";
}

function parseDeadLetterFilters(c: Context): {
  walletAddress?: Address;
  targetAgent?: AgentType;
  limit: number;
  error?: Response;
} {
  const walletAddress = c.req.query("walletAddress");
  const targetAgent = c.req.query("targetAgent");
  const limit = c.req.query("limit");

  const parsedWallet = walletAddress
    ? z.string().regex(/^0x[a-fA-F0-9]{40}$/).safeParse(walletAddress)
    : undefined;
  if (parsedWallet && !parsedWallet.success) {
    return {
      limit: 50,
      error: c.json(fail("BAD_REQUEST", "walletAddress must be an EVM address."), 400),
    };
  }

  const parsedAgent = targetAgent
    ? z.enum(["scan", "correlate", "simulate", "optimize", "execute", "monitor"]).safeParse(targetAgent)
    : undefined;
  if (parsedAgent && !parsedAgent.success) {
    return {
      limit: 50,
      error: c.json(fail("BAD_REQUEST", "targetAgent is invalid."), 400),
    };
  }

  const parsedLimit = limit ? Number(limit) : 50;
  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
    return {
      limit: 50,
      error: c.json(fail("BAD_REQUEST", "limit must be an integer from 1 to 500."), 400),
    };
  }

  return {
    walletAddress: parsedWallet?.success ? parsedWallet.data as Address : undefined,
    targetAgent: parsedAgent?.success ? parsedAgent.data as AgentType : undefined,
    limit: parsedLimit,
  };
}

export function createAgentOrchestrationRoute(
  orchestrator: AgentOrchestrator,
): Hono {
  const route = new Hono();

  route.get("/runs", (c) => {
    const walletAddress = c.req.query("walletAddress");
    const targetAgent = c.req.query("targetAgent");
    const status = c.req.query("status");
    const limit = c.req.query("limit");

    const parsedWallet = walletAddress
      ? z.string().regex(/^0x[a-fA-F0-9]{40}$/).safeParse(walletAddress)
      : undefined;
    if (parsedWallet && !parsedWallet.success) {
      return c.json(fail("BAD_REQUEST", "walletAddress must be an EVM address."), 400);
    }

    const parsedAgent = targetAgent
      ? z.enum(["scan", "correlate", "simulate", "optimize", "execute", "monitor"]).safeParse(targetAgent)
      : undefined;
    if (parsedAgent && !parsedAgent.success) {
      return c.json(fail("BAD_REQUEST", "targetAgent is invalid."), 400);
    }

    const parsedStatus = status
      ? z
          .enum(["queued", "running", "waiting_for_user", "completed", "failed", "cancelled"])
          .safeParse(status)
      : undefined;
    if (parsedStatus && !parsedStatus.success) {
      return c.json(fail("BAD_REQUEST", "status is invalid."), 400);
    }

    const parsedLimit = limit ? Number(limit) : 50;
    if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 500) {
      return c.json(fail("BAD_REQUEST", "limit must be an integer from 1 to 500."), 400);
    }

    return c.json(ok({
      runs: orchestrator.listRuns({
        walletAddress: parsedWallet?.success ? parsedWallet.data as Address : undefined,
        targetAgent: parsedAgent?.success ? parsedAgent.data as AgentType : undefined,
        status: parsedStatus?.success ? parsedStatus.data as AgentRunStatus : undefined,
        limit: parsedLimit,
      }),
    }));
  });

  route.get("/queue", (c) => {
    return c.json(ok(orchestrator.getQueueSnapshot()));
  });

  route.get("/dead-letter", (c) => {
    const filter = parseDeadLetterFilters(c);
    if (filter.error) return filter.error;

    return c.json(ok({
      runs: orchestrator.listDeadLetters({
        walletAddress: filter.walletAddress,
        targetAgent: filter.targetAgent,
        limit: filter.limit,
      }),
    }));
  });

  route.get("/dead-letter/stream", (c) => {
    const filter = parseDeadLetterFilters(c);
    if (filter.error) return filter.error;

    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown, id?: string): void => {
          controller.enqueue(encoder.encode(encodeSse(event, data, id)));
        };

        for (const storedRun of orchestrator.listDeadLetters(filter)) {
          send("agent.run.dead_lettered", storedRun, storedRun.run.id);
        }

        unsubscribe = orchestrator.subscribeDeadLetters((event) => {
          const storedRun = event.id ? orchestrator.getRun(event.id) : undefined;
          if (!storedRun?.meta?.deadLetter) return;
          if (
            filter.walletAddress &&
            storedRun.input.walletAddress.toLowerCase() !==
              filter.walletAddress.toLowerCase()
          ) {
            return;
          }
          if (
            filter.targetAgent &&
            (storedRun.input.targetAgent ?? "correlate") !== filter.targetAgent
          ) {
            return;
          }

          send(event.event, storedRun, storedRun.run.id);
        });
      },
      cancel() {
        unsubscribe?.();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  });

  route.post("/runs", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = orchestrationRunSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        fail(
          "INVALID_AGENT_ORCHESTRATION_REQUEST",
          "Invalid agent orchestration request",
          parsed.error.issues,
        ),
        400,
      );
    }

    return c.json(ok(orchestrator.enqueue(toInput(parsed.data))), 202);
  });

  route.post("/run", async (c) => {
    const body = await c.req.json().catch(() => undefined);
    const parsed = orchestrationRunSchema.safeParse(body);

    if (!parsed.success) {
      return c.json(
        fail(
          "INVALID_AGENT_ORCHESTRATION_REQUEST",
          "Invalid agent orchestration request",
          parsed.error.issues,
        ),
        400,
      );
    }

    const result = await orchestrator.run(toInput(parsed.data));
    return c.json(ok(result), result.run.status === "failed" ? 500 : 200);
  });

  route.get("/run/:runId", (c) => {
    const run = orchestrator.getRun(c.req.param("runId"));
    if (!run) {
      return c.json(fail("RUN_NOT_FOUND", "Agent run was not found."), 404);
    }

    return c.json(ok(run));
  });

  route.post("/run/:runId/retry", (c) => {
    const result = orchestrator.retryDeadLetter(c.req.param("runId"));
    if (!result) {
      return c.json(
        fail("RUN_NOT_RETRYABLE", "Run was not found or is not dead-lettered."),
        409,
      );
    }

    return c.json(ok(result), 202);
  });

  route.get("/messages/:correlationId", (c) => {
    return c.json(ok({
      correlationId: c.req.param("correlationId"),
      messages: orchestrator.getMessages(c.req.param("correlationId")),
    }));
  });

  route.get("/stream/:correlationId", (c) => {
    const correlationId = c.req.param("correlationId");
    const encoder = new TextEncoder();
    let unsubscribe: (() => void) | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const send = (event: string, data: unknown, id?: string): void => {
          controller.enqueue(encoder.encode(encodeSse(event, data, id)));
        };

        const existingRun = orchestrator.getRunByCorrelationId(correlationId);
        if (existingRun) send("agent.run.snapshot", existingRun.run, existingRun.run.id);

        for (const message of orchestrator.getMessages(correlationId)) {
          send(message.topic, message, message.id);
        }

        if (existingRun && isTerminalStatus(existingRun.run.status)) {
          send("stream.complete", { correlationId });
          controller.close();
          return;
        }

        unsubscribe = orchestrator.subscribe(correlationId, (event) => {
          send(event.event, event.data, event.id);
          if (
            event.event === "agent.run.completed" ||
            event.event === "agent.run.failed" ||
            event.event === "agent.run.dead_lettered"
          ) {
            send("stream.complete", { correlationId });
            unsubscribe?.();
            controller.close();
          }
        });
      },
      cancel() {
        unsubscribe?.();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      },
    });
  });

  return route;
}
