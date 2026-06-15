import type { Context, ErrorHandler, NotFoundHandler } from "hono";
import { fail } from "./responses.js";
import { getRequestId } from "../middleware/requestContext.js";

function safeRequestId(c: Context): string | undefined {
  try {
    return getRequestId(c);
  } catch {
    return undefined;
  }
}

export const notFoundHandler: NotFoundHandler = (c) => {
  return c.json(
    fail(
      "NOT_FOUND",
      `No route found for ${c.req.method} ${new URL(c.req.url).pathname}`,
      undefined,
      safeRequestId(c),
    ),
    404,
  );
};

export const errorHandler: ErrorHandler = (error, c) => {
  const requestId = safeRequestId(c);

  console.error(
    `Unhandled server error${requestId ? ` ${requestId}` : ""}`,
    error,
  );

  return c.json(
    fail(
      "INTERNAL_SERVER_ERROR",
      "Unexpected server error",
      undefined,
      requestId,
    ),
    500,
  );
};
