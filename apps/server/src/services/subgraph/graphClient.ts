import type { ServerConfig } from "../../config.js";

const GATEWAY = "https://gateway.thegraph.com/api";

export interface GraphResult<T> {
  data?: T;
  errors?: { message: string }[];
}

/**
 * Queries a subgraph on The Graph's decentralized gateway. Requires a *query*
 * API key (THE_GRAPH_KEY) — a deploy key will return "API key not found".
 * Returns null when no key is configured or the request fails, so callers can
 * fall back gracefully.
 */
export async function querySubgraph<T>(
  config: ServerConfig,
  subgraphId: string,
  query: string,
  variables?: Record<string, unknown>,
): Promise<T | null> {
  if (!config.theGraphKey) return null;

  try {
    const res = await fetch(`${GATEWAY}/${config.theGraphKey}/subgraphs/id/${subgraphId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) throw new Error(`subgraph ${res.status}`);
    const json = (await res.json()) as GraphResult<T>;
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }
    return json.data ?? null;
  } catch (err) {
    console.warn(`[subgraph] query failed (${subgraphId}): ${String(err)}`);
    return null;
  }
}
