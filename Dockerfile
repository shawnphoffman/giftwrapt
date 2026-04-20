FROM node:20-slim AS base
ENV COREPACK_HOME=/usr/local/share/corepack
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# Install dependencies only when needed
FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

# Production image, copy all the files and run the server
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
	adduser --system --uid 1001 --ingroup nodejs nodejs

# Create directory for writable files with proper permissions
RUN mkdir -p /app/data && \
	chown -R nodejs:nodejs /app/data

# Copy only necessary files
COPY --from=builder /app/.output ./.output
COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml ./
COPY tsconfig.json ./
COPY drizzle.config.ts ./
# Full src + scripts are needed at runtime by the operator-facing CLIs
# (db:seed, admin:create, admin:reset-password) which are run via tsx via
# `docker exec`. They need @/lib/auth, @/db, @/env at minimum; easier to
# just ship the whole src tree than enumerate every transitive import.
COPY src ./src
COPY scripts ./scripts
COPY docker/entrypoint.sh /app/docker/entrypoint.sh
COPY docker/migrate.sh /app/docker/migrate.sh
COPY docker/healthcheck.sh /app/docker/healthcheck.sh

RUN chmod +x /app/docker/entrypoint.sh \
	/app/docker/migrate.sh \
	/app/docker/healthcheck.sh

EXPOSE 3000

USER nodejs

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD /app/docker/healthcheck.sh

ENTRYPOINT ["/app/docker/entrypoint.sh"]
