# =============================================================================
# Dockerfile — FlowBoard Server
# Multi-stage build: build stage compiles TypeScript, runtime stage is lean.
#
# Usage:
#   docker build -t flowboard-server .
#   docker run -p 8080:8080 --env-file .env.production flowboard-server
# =============================================================================

# ── Stage 1: Build ────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy manifests first for better layer caching
COPY package*.json ./
RUN npm install --ignore-scripts

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Prune dev dependencies so they don't leak into the runtime image
RUN npm prune --production

# ── Stage 2: Runtime ──────────────────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Security: run as non-root
RUN addgroup -S flowboard && adduser -S flowboard -G flowboard

WORKDIR /app

# Copy compiled output and production node_modules from builder
COPY --from=builder --chown=flowboard:flowboard /app/dist       ./dist
COPY --from=builder --chown=flowboard:flowboard /app/node_modules ./node_modules
COPY --from=builder --chown=flowboard:flowboard /app/package.json ./package.json

# Copy migrations alongside the binary for the migrate script
COPY --from=builder --chown=flowboard:flowboard /app/src/db/migrations ./dist/db/migrations

USER flowboard

# Azure Web App expects PORT env var (defaults to 8080)
ENV NODE_ENV=production
EXPOSE 8080

# Healthcheck — Azure uses this to decide when the container is ready
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:8080/health || exit 1

CMD ["node", "dist/server.js"]
