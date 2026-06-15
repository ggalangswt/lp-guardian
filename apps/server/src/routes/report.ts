import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import { getReport } from "../storage/reportStore.js";
import { getOnchainReport } from "../chain/reportRegistry.js";

export function createReportRoute(config: ServerConfig): Hono {
  const route = new Hono();

  route.get("/:rootHash", async (c) => {
    const rootHash = c.req.param("rootHash");
    const report = getReport(rootHash);

    if (!report) {
      // Not in the local cache — confirm whether it was anchored on-chain so the
      // client can distinguish "unknown" from "anchored but body unavailable".
      const onchain = /^0x[0-9a-fA-F]{64}$/.test(rootHash)
        ? await getOnchainReport(config, rootHash as `0x${string}`)
        : null;
      return c.json(
        {
          error: "Report not found in cache.",
          anchoredOnChain: onchain?.exists ?? false,
        },
        404,
      );
    }

    return c.json(report);
  });

  return route;
}
