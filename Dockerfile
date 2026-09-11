# =============================================================================
# Production image. Multi-stage: dependencies -> build -> minimal runtime.
# Build-time public config must be supplied as build args because Vite inlines
# VITE_* values into the client bundle. Server-only secrets are provided at
# runtime as environment variables and are never baked into the image.
# =============================================================================

FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock* bunfig.toml ./
RUN bun install --frozen-lockfile

FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ARG VITE_MARKET_REST_URL
ARG VITE_MARKET_WS_URL
ARG BUILD_REVISION=unknown
ENV NODE_ENV=production BUILD_REVISION=$BUILD_REVISION

RUN bun run build

FROM oven/bun:1-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.output ./.output
USER app
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- "http://127.0.0.1:${PORT}/api/public/health" || exit 1
CMD ["bun", ".output/server/index.mjs"]
