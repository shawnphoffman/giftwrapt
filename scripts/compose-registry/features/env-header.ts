/**
 * Top-of-file banner for `.env.example`. The compose targets emit their
 * own headers (see `targets.ts`).
 */
export const envExampleHeader = `# =============================================================================
# GiftWrapt - Environment Variables (Self-Hosted Docker)
# =============================================================================
# Template for self-hosted Docker deploys (docker/compose.selfhost-*.yaml).
# Copy this file to \`.env\` in the directory you run \`docker compose\` from.
#
# For local development against the bundled docker-compose.yaml stack, use
# \`.env.local.example\` instead via \`pnpm setup:env\`. The hostnames in this
# file (postgres, garage, app) are in-cluster service names that won't
# resolve from your host machine.
#
# Variables marked [required] must be set; others have sensible defaults.

`
