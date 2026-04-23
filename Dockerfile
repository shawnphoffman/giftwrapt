FROM node:22-slim AS base
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# Full dependency install (incl. devDependencies) for the build
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Build both the Nitro server bundle and the standalone CLI bundles
# (.output/scripts/*.mjs) — `pnpm build` runs vite build + build:cli.
FROM base AS builder
ENV NODE_OPTIONS=--max-old-space-size=4096
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Runtime image: plain node, no pnpm, no node_modules. The Nitro bundle under
# .output/server is self-contained (only tslib in .output/server/node_modules),
# and the CLI bundles under .output/scripts are self-contained too.
FROM node:22-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

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

# Strip vendored npm/corepack — entrypoint/migrate/healthcheck invoke `node`
# directly and .output/server is self-contained, so npm's bundled tar/cross-spawn/
# glob/minimatch are dead weight dragging CVEs into the image.
RUN rm -rf /usr/local/lib/node_modules \
	/usr/local/bin/npm \
	/usr/local/bin/npx \
	/usr/local/bin/corepack \
	/opt/yarn* \
	/usr/local/bin/yarn* \
	2>/dev/null || true

EXPOSE 3000

USER nodejs

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
	CMD /app/docker/healthcheck.sh

ENTRYPOINT ["/app/docker/entrypoint.sh"]
