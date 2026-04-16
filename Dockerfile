FROM node:20-slim as base

# Install dependencies only when needed
FROM base AS deps
WORKDIR /app

# Install dependencies based on the preferred package manager
COPY package.json pnpm-lock.yaml* ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Install pnpm in the builder stage
RUN npm install -g pnpm

# Build the application
RUN pnpm build

# Production image, copy all the files and run the server
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PNPM_HOME=/usr/local/share/pnpm
ENV PATH=$PNPM_HOME:$PATH

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
	adduser --system --uid 1001 nodejs

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

# Install pnpm for migrations and tsx for admin scripts
RUN npm install -g pnpm && \
	chmod +x /app/docker/entrypoint.sh && \
	chmod +x /app/docker/migrate.sh && \
	chmod +x /app/docker/healthcheck.sh

EXPOSE 3000

USER nodejs

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
	CMD /app/docker/healthcheck.sh

ENTRYPOINT ["/app/docker/entrypoint.sh"]