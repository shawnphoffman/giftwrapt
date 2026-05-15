import type { ComposeFeature, EnvExampleSection } from '../types.ts'

type CronVariant = 'garage' | 'rustfs'

/**
 * Cron sidecar. The two selfhost variants currently carry slightly
 * different leading comments and inline env-var comments - that's
 * incidental drift from when the rustfs variant was forked, not a
 * deliberate split. Preserved per-variant here for byte parity; once
 * the registry is the source of truth they should be unified.
 */
export function cronFeature(variant: CronVariant): ComposeFeature {
	const leadingComment = variant === 'garage' ? garageLeadingComment : rustfsLeadingComment
	const body = variant === 'garage' ? garageBody : rustfsBody
	return {
		id: `cron-${variant}`,
		services: [{ name: 'cron', body, leadingComment }],
	}
}

const garageLeadingComment = `  # Cron sidecar. Reads CRON_SECRET from the env file and curls the app's
  # /api/cron/* endpoints on a daily schedule (mirrors vercel.json). To
  # disable, run with \`--profile no-cron\` (the default profile is empty so
  # it always runs, but compose ignores undefined services on stop). To
  # change schedules, edit ./cron-entrypoint.sh and recreate the service.
  # Higher cadences are safe: per-user advisory locks de-duplicate work.`

const rustfsLeadingComment = `  # Cron sidecar. Reads CRON_SECRET from the env file and curls the app's
  # /api/cron/* endpoints on a daily schedule (mirrors vercel.json). To
  # change schedules, edit ./cron-entrypoint.sh and recreate the service.
  # Higher cadences are safe: per-user advisory locks de-duplicate work.`

const garageBody = `    image: alpine:3.20
    env_file: .env
    environment:
      # Talks to the app over the compose network. Override CRON_APP_URL if
      # the app service is named differently or you want crons to hit a
      # public URL (slower, but exercises the same code path as Vercel).
      CRON_APP_URL: \${CRON_APP_URL:-http://app:3001}
      TZ: \${TZ:-UTC}
    volumes:
      - ./cron-entrypoint.sh:/cron-entrypoint.sh:ro
    command: ['sh', '/cron-entrypoint.sh']
    depends_on:
      app:
        condition: service_started
    restart: unless-stopped
`

const rustfsBody = `    image: alpine:3.20
    env_file: .env
    environment:
      CRON_APP_URL: \${CRON_APP_URL:-http://app:3001}
      TZ: \${TZ:-UTC}
    volumes:
      - ./cron-entrypoint.sh:/cron-entrypoint.sh:ro
    command: ['sh', '/cron-entrypoint.sh']
    depends_on:
      app:
        condition: service_started
    restart: unless-stopped
`

export const cronEnvSection: EnvExampleSection = {
	id: 'cron',
	body: `# -----------------------------------------------------------------------------
# Cron jobs - optional
# -----------------------------------------------------------------------------
# Secret to protect the /api/cron/* endpoints from public access.
# Set this and pass it as a Bearer token when calling cron routes:
#   curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain.com/api/cron/birthday-emails
# Generate: openssl rand -base64 32
# CRON_SECRET=change-me-to-a-random-secret
`,
}
