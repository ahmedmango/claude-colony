# Claude Colony — production image
#
# Note: the Dockerized colony CANNOT tail `~/.claude/projects/` from the host
# unless you bind-mount it. That's by design — the observer needs your local
# transcripts. Example:
#
#   docker run --rm -it \
#     -p 3174:3174 \
#     -v "$HOME/.claude:/root/.claude:ro" \
#     ghcr.io/ahmedmango/claude-colony
#
# For spawning (POST /api/spawn) to work inside the container, the `claude`
# CLI must also be available in the image — it is not bundled here. That
# feature is designed for local-run only. Use the image as a dashboard.

FROM oven/bun:1.1-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM base AS runtime
ENV NODE_ENV=production
ENV COLONY_NO_OPEN=1
ENV COLONY_PORT=3174

COPY --from=deps /app/node_modules ./node_modules
COPY server ./server
COPY public ./public
COPY skills ./skills
COPY docs ./docs
COPY package.json README.md ARCHITECTURE.md AUTH.md LICENSE ./

EXPOSE 3174

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=2 \
  CMD wget -qO- http://127.0.0.1:${COLONY_PORT}/healthz || exit 1

CMD ["bun", "server/index.ts"]
