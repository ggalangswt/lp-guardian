import type { Context, MiddlewareHandler } from "hono";

const REQUEST_ID_HEADER = "x-request-id";

function createRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getRequestId(c: Context): string {
  return c.get("requestId") as string;
}

export function requestContext(): MiddlewareHandler {
  return async (c, next) => {
    const requestId = c.req.header(REQUEST_ID_HEADER) ?? createRequestId();
    c.set("requestId", requestId);
    c.header(REQUEST_ID_HEADER, requestId);

    await next();
  };
}
