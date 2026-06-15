import { callTool, tools } from "./tools.js";

const ping = await callTool("lp_guardian_ping", {});
process.env.LPGUARDIAN_MCP_ACCESS_MODE = "token";
process.env.LPGUARDIAN_MCP_ACCESS_TOKEN = "smoke-secret";

const denied = await callTool("portfolio_monitor", {
  walletAddress: "0x0000000000000000000000000000000000000000",
  accessToken: "wrong-secret",
});

console.log(JSON.stringify({
  toolCount: tools.length,
  toolNames: tools.map((tool) => tool.name),
  ping,
  accessDenied: denied,
}, null, 2));
