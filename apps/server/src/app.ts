import { Hono } from "hono";
import { cors } from "hono/cors";
import type { ServerConfig } from "./config.js";
import { errorHandler, notFoundHandler } from "./http/handlers.js";
import { requestContext } from "./middleware/requestContext.js";
import { requestLogger } from "./middleware/requestLogger.js";
import { createAgentRuntime } from "./services/agentRuntime/index.js";
import { createDiagnoseRoute } from "./routes/diagnose.js";
import { createAgentOrchestrationRoute } from "./routes/agent/orchestration.js";
import { createAgentRuntimeRoute } from "./routes/agent/runtime.js";
import { createAgentSkillsRoute } from "./routes/agent/skills.js";
import { createHealthRoute } from "./routes/health.js";
import { createDiscoveryRoute } from "./routes/discovery.js";
import { createAgentMonitorRoute } from "./routes/agent/monitor.js";
import { createAgentFoundationRunRoute } from "./routes/agent/run.js";
import { createPositionsRoute } from "./routes/positions.js";
import { createReportRoute } from "./routes/report.js";
import { createPortfolioRoute } from "./routes/portfolio.js";
import { createTuringRoute } from "./routes/turing.js";
import { AgentOrchestrator } from "./services/agentOrchestrator.js";
import {
  AgentStateStore,
  type AgentStateRepository,
} from "./services/agentStateStore.js";
import type { AgentRunQueue } from "./services/agentRunQueue.js";
import { MonitorService } from "./services/portfolio/monitorService.js";

export interface AppServices {
  agentStateStore?: AgentStateRepository;
  agentRunQueue?: AgentRunQueue;
  monitorService?: MonitorService;
  agentOrchestrator?: AgentOrchestrator;
}

export function createApp(config: ServerConfig, services: AppServices = {}): Hono {
  const app = new Hono();
  const agentRuntime = createAgentRuntime(config);
  const agentStateStore = services.agentStateStore ?? new AgentStateStore();
  const monitorService =
    services.monitorService ?? new MonitorService(config, agentStateStore);
  const agentOrchestrator =
    services.agentOrchestrator ??
    new AgentOrchestrator(
      config,
      monitorService,
      agentStateStore,
      services.agentRunQueue,
    );

  const corsOrigin = config.corsOrigins.includes("*")
    ? "*"
    : config.corsOrigins;

  app.use(
    "*",
    cors({
      origin: corsOrigin,
      allowMethods: ["GET", "POST", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"],
      maxAge: 86_400,
    }),
  );
  app.use("*", requestContext());
  app.use("*", requestLogger());

  app.route("/health", createHealthRoute(config));
  app.route("/.well-known", createDiscoveryRoute(config));
  app.route("/agent/runtime", createAgentRuntimeRoute(config));
  app.route("/agent/skills", createAgentSkillsRoute());
  app.route("/agent/monitor", createAgentMonitorRoute(monitorService));
  app.route("/agent/orchestration", createAgentOrchestrationRoute(agentOrchestrator));
  app.route("/agent/foundation/run", createAgentFoundationRunRoute(agentRuntime));
  app.route("/api/diagnose", createDiagnoseRoute(config, agentRuntime));
  app.route("/api/positions", createPositionsRoute(config));
  app.route("/api/report", createReportRoute(config));
  app.route("/api/portfolio", createPortfolioRoute(config));
  app.route("/portfolio", createPortfolioRoute(config, agentOrchestrator));
  app.route("/api/turing", createTuringRoute(config));

  app.notFound(notFoundHandler);
  app.onError(errorHandler);

  return app;
}
