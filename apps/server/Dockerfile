# Dockerfile for LP Guardian backend server (pnpm monorepo).
#
# Railway setup:
#   - Root Directory: /  (workspace root — so COPY can reach packages/)
#   - Dockerfile Path: apps/server/Dockerfile
#   - Required env vars: PORT (auto-injected), NODE_ENV, AGENT_RUNTIME,
#     STRATEGIST_PROVIDER, CORS_ORIGINS, LPGUARDIAN_CHAIN_MODE, MANTLE_RPC,
#     GEMINI_API_KEY, BE_DATA_SERVICE_URL, LPGUARDIAN_TURING_REGISTRY.

FROM node:20-slim AS builder

WORKDIR /app

# Activate the pnpm version pinned in package.json.
RUN corepack enable

# Install deps before copying source for better layer caching.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile

# Copy source.
COPY packages/core/ ./packages/core/
COPY apps/server/ ./apps/server/

# Build shared types first, then the server.
RUN pnpm --filter @lp-guardian/core build
RUN pnpm --filter @lp-guardian/server build

# ── Runtime image ──────────────────────────────────────────────────────────────
FROM node:20-slim

WORKDIR /app

RUN corepack enable

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/core/package.json ./packages/core/
COPY apps/server/package.json ./apps/server/

# Install all deps (workspace linking needs the full graph).
RUN pnpm install --frozen-lockfile

COPY --from=builder /app/packages/core/dist ./packages/core/dist
COPY --from=builder /app/apps/server/dist ./apps/server/dist

ENV NODE_ENV=production

# Railway injects PORT at runtime; server reads process.env.PORT.
EXPOSE 3001

CMD ["node", "apps/server/dist/index.js"]
