#!/usr/bin/env node
import { createInterface } from "node:readline";
import { stdin, stdout } from "node:process";
import { callTool, tools } from "./tools.js";
import type {
  JsonRpcFailure,
  JsonRpcRequest,
  JsonRpcSuccess,
} from "./types.js";

const SERVER_INFO = {
  name: "lp-guardian-mcp",
  version: "0.1.0",
};

function write(message: JsonRpcSuccess | JsonRpcFailure): void {
  stdout.write(`${JSON.stringify(message)}\n`);
}

function success(
  id: JsonRpcRequest["id"],
  result: unknown,
): JsonRpcSuccess {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    result,
  };
}

function failure(
  id: JsonRpcRequest["id"],
  code: number,
  message: string,
  data?: unknown,
): JsonRpcFailure {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: {
      code,
      message,
      data,
    },
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

async function handle(request: JsonRpcRequest): Promise<void> {
  if (request.id === undefined && request.method.startsWith("notifications/")) {
    return;
  }

  switch (request.method) {
    case "initialize":
      write(success(request.id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: SERVER_INFO,
      }));
      return;

    case "ping":
      write(success(request.id, {}));
      return;

    case "tools/list":
      write(success(request.id, { tools }));
      return;

    case "tools/call": {
      const params = asRecord(request.params);
      const name = params.name;
      if (typeof name !== "string") {
        write(failure(request.id, -32602, "tools/call requires a string name."));
        return;
      }

      const result = await callTool(name, params.arguments);
      write(success(request.id, result));
      return;
    }

    default:
      write(failure(request.id, -32601, `Method not found: ${request.method}`));
  }
}

const rl = createInterface({
  input: stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  if (!line.trim()) return;

  let request: JsonRpcRequest;
  try {
    request = JSON.parse(line) as JsonRpcRequest;
  } catch (error) {
    write(failure(null, -32700, "Parse error", String(error)));
    return;
  }

  handle(request).catch((error: unknown) => {
    write(failure(
      request.id,
      -32000,
      error instanceof Error ? error.message : String(error),
    ));
  });
});
