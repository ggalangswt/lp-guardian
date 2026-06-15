import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import { ok } from "../http/responses.js";

const MCP_TOOLS = [
  "lp_guardian_ping",
  "portfolio_diagnose",
  "portfolio_simulate",
  "portfolio_optimize",
  "portfolio_execute",
  "portfolio_monitor",
];

export function createDiscoveryRoute(config: ServerConfig): Hono {
  const route = new Hono();

  route.get("/mcp-server", (c) => {
    const url = new URL(c.req.url);

    return c.json(
      ok({
        name: "lp-guardian",
        version: "0.1.0",
        transport: "stdio",
        tools: MCP_TOOLS,
        baseUrl: url.origin,
        apiBasePath: "/api",
        orchestrationBasePath: "/agent/orchestration",
        byrealSkillsPath: "/agent/skills/byreal",
        chainMode: config.chainMode,
        chainId: config.mantleChainId,
        runtime: {
          agentRuntime: config.agentRuntimeProvider,
          strategistProvider: config.strategistProvider,
          beDataConfigured: Boolean(config.beDataServiceUrl),
        },
        provenance: {
          label: "VERIFIED",
          source: "LP Guardian backend discovery route",
          degraded: false,
          warnings: [],
          observedAt: Date.now(),
        },
      }),
    );
  });

  return route;
}
