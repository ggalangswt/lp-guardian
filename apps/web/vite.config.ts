import { execSync } from "node:child_process";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// Latest annotated git tag — injected as VITE_GIT_TAG so the header
// chip stays in sync with releases without a manual bump. Falls back
// to "dev" outside a git checkout (e.g. Docker build context).
function readGitTag(): string {
  try {
    return execSync("git describe --tags --abbrev=0", {
      cwd: __dirname,
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

// TODO(mantle): update DEFAULT_API_BASE_URL after backend is deployed
const DEFAULT_API_BASE_URL = "http://localhost:3001";

function resolveApiBaseUrl(mode: string): string {
  const env = loadEnv(mode, "../../", "");
  const raw =
    env.VITE_LPGUARDIAN_API_URL ??
    env.VITE_API_URL ??
    DEFAULT_API_BASE_URL;
  const trimmed = raw.trim();
  if (!trimmed) return DEFAULT_API_BASE_URL;
  return trimmed.replace(/\/+$/, "");
}

// Load env from the workspace root so VITE_LPGUARDIAN_AGENT_CONTRACT,
// VITE_LPGUARDIAN_API_URL, VITE_MANTLE_RPC etc. resolved by /agent
// and the main diagnostic surfaces come from the same env source.
export default defineConfig(({ mode }) => {
  const apiBaseUrl = resolveApiBaseUrl(mode);

  return {
    plugins: [react()],
    envDir: "../../",
    define: {
      "import.meta.env.VITE_GIT_TAG": JSON.stringify(readGitTag()),
    },
    server: {
      port: 3100,
      strictPort: true,
      proxy: {
        "/api": apiBaseUrl,
        "/health": apiBaseUrl,
      },
    },
  };
});
