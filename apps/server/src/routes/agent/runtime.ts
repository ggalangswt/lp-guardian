import { Hono } from "hono";
import type { ServerConfig } from "../../config.js";
import { ok } from "../../http/responses.js";
import { getRuntimeStatus } from "../../services/runtimeStatus.js";

export function createAgentRuntimeRoute(config: ServerConfig): Hono {
  const route = new Hono();

  route.get("/", (c) => {
    return c.json(ok(getRuntimeStatus(config)));
  });

  return route;
}
