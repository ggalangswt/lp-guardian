import { Hono } from "hono";
import type { DiagnosticEvent } from "@lp-guardian/core";
import type { ServerConfig } from "../config.js";
import { runDiagnosticPipeline } from "../pipeline/runDiagnosticPipeline.js";
import { diagnoseQuerySchema } from "../schemas/agent.js";
import type { AgentRuntime } from "../services/agentRuntime/index.js";

const encoder = new TextEncoder();

function encodeSse(event: DiagnosticEvent): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify(event)}\n\n`);
}

export function createDiagnoseRoute(
  config: ServerConfig,
  agentRuntime?: AgentRuntime,
): Hono {
  const route = new Hono();

  route.get("/:tokenId", (c) => {
    const tokenId = c.req.param("tokenId");
    const parsedQuery = diagnoseQuerySchema.safeParse({
      walletAddress: c.req.query("walletAddress"),
      scenario: c.req.query("scenario"),
      protocol: c.req.query("protocol"),
    });

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          if (!parsedQuery.success) {
            controller.enqueue(
              encodeSse({
                type: "error",
                message: parsedQuery.error.message,
              }),
            );
            return;
          }

          for await (const event of runDiagnosticPipeline(config, tokenId, {
            agentRuntime,
            foundationInput: parsedQuery.data,
            protocolHint: parsedQuery.data.protocol,
          })) {
            controller.enqueue(encodeSse(event));
          }
        } catch (err) {
          controller.enqueue(
            encodeSse({ type: "error", message: String(err) }),
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  });

  return route;
}
