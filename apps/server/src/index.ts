import { serve } from "@hono/node-server";
import { createApp } from "./app.js";
import { loadConfig, loadLocalEnv } from "./config.js";
import { AgentStateStore } from "./services/agentStateStore.js";
import { MonitorService } from "./services/portfolio/monitorService.js";

loadLocalEnv();
const config = loadConfig();

// Start autonomous background monitoring
const agentStateStore = new AgentStateStore();
const monitor = new MonitorService(config, agentStateStore);
const app = createApp(config, {
  agentStateStore,
  monitorService: monitor,
});
monitor.start();

serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    console.log(
      `LP Guardian server listening on http://localhost:${info.port}`,
    );
  },
);

