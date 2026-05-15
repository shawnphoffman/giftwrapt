FROM node:22-slim AS base
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# Full dependency install (incl. devDependencies) for the build
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build both the Nitro server bundle and the standalone CLI bundles
# (.output/scripts/*.mjs) - `pnpm build` runs vite build + build:cli.
FROM base AS builder
ENV NODE_OPTIONS=--max-old-space-size=4096
# APP_COMMIT is baked into the bundle (vite.config.ts → VITE_APP_COMMIT) so the
# admin debug page can show which commit produced this image. Defaults to empty;
# CI passes the release SHA via --build-arg.
ARG APP_COMMIT=""
ENV APP_COMMIT=$APP_COMMIT
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Runtime image: plain node, no pnpm, no node_modules. The Nitro bundle under
# .output/server is self-contained (only tslib in .output/server/node_modules),
# and the CLI bundles under .output/scripts are self-contained too.
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
# Bind to all interfaces (incl. IPv6) by default. PaaS providers like Railway
# and Fly use IPv6-only private networking; the Linux dual-stack default also
# accepts IPv4 connections, so this is a safe override for self-hosters too.
# Override with HOST=0.0.0.0 if you need IPv4-only for some reason.
ENV HOST=::
# Nitro reads PORT at boot to pick its listener; default to 3001 to match the
# rest of the project (local dev, .env templates, compose port mappings).
ENV PORT=3001

RUN addgroup --system --gid 1001 nodejs && \
	adduser --system --uid 1001 --ingroup nodejs nodejs

RUN mkdir -p /app/data && \
	chown -R nodejs:nodejs /app/data

# The built output: server bundle (.output/server) + CLI bundles (.output/scripts)
COPY --from=builder /app/.output ./.output
# Migration SQL + _journal.json consumed by the migrate CLI on boot.
COPY drizzle ./drizzle
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
COPY docker/migrate.sh /app/docker/migrate.sh
COPY docker/healthcheck.sh /app/docker/healthcheck.sh

RUN chmod +x /app/docker/entrypoint.sh \
	/app/docker/migrate.sh \
	/app/docker/healthcheck.sh

# Strip vendored npm/corepack - entrypoint/migrate/healthcheck invoke `node`
# directly and .output/server is self-contained, so npm's bundled tar/cross-spawn/
# glob/minimatch are dead weight dragging CVEs into the image.
RUN rm -rf /usr/local/lib/node_modules \
	/usr/local/bin/npm \
	/usr/local/bin/npx \
	/usr/local/bin/corepack \
	/opt/yarn* \
	/usr/local/bin/yarn* \
	2>/dev/null || true

EXPOSE 3001

USER nodejs

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD /app/docker/healthcheck.sh

ENTRYPOINT ["/app/docker/entrypoint.sh"]
