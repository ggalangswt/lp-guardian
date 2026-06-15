import { Hono } from "hono";
import type { ServerConfig } from "../config.js";
import { fetchPositions } from "../indexer/positionAggregator.js";
import { computePortfolioMetrics } from "../pipeline/math/portfolioMetrics.js";
import { computeRisk } from "../chain/riskEngine.js";

export function createPositionsRoute(config: ServerConfig): Hono {
  const route = new Hono();

  route.get("/:address", async (c) => {
    const address = c.req.param("address");
    const forceMock = c.req.query("mock") === "1";

    const result = await fetchPositions(config, address, { forceMock });

    // Portfolio-level risk via the deployed Stylus PortfolioRiskEngine.
    const metrics = computePortfolioMetrics(result.positions, config);
    const risk = await computeRisk(config, metrics);

    return c.json({
      address: result.address,
      version: result.version,
      source: result.source,
      warnings: result.warnings,
      positions: result.positions,
      portfolioRisk: {
        riskScoreBps: risk.riskScoreBps,
        riskTier: risk.riskTier,
        recommendedAction: risk.recommendedAction,
        source: risk.source,
        metrics,
      },
    });
  });

  return route;
}
