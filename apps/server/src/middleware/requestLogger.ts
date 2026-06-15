import type { MiddlewareHandler } from "hono";
import { getRequestId } from "./requestContext.js";

export function requestLogger(): MiddlewareHandler {
  return async (c, next) => {
    const startedAt = performance.now();

    await next();

    const durationMs = Math.round(performance.now() - startedAt);
    const requestId = getRequestId(c);
    const method = c.req.method;
    const path = new URL(c.req.url).pathname;

    console.log(
      `${method} ${path} ${c.res.status} ${durationMs}ms ${requestId}`,
    );
  };
}
