import type { ComposeFeature, EnvExampleSection } from '../types.ts'

/**
 * Scraper sidecar. Two services: `browserless` (the Chromium engine) and
 * `scraper` (the facade that core talks to). Modeled after the sibling
 * giftwrapt/scraper repo's compose file but pared down to the minimum
 * needed for a self-hosted core deployment - flaresolverr / byparr / the
 * scrapfly remote rung are intentionally omitted. Operators who want
 * those rungs should run the full giftwrapt/scraper stack separately.
 *
 * Core consumes the scraper via the admin-configured "Scrape provider"
 * entry (type=giftwrapt-scraper, see src/lib/settings.ts), not a server
 * env var. Set the URL to http://scraper:8080 and the token to the
 * BROWSER_TOKEN value after the stack is up.
 *
 * Stubbed in for future shapes; no current target includes this feature.
 * Add `scraperFeature` to a target's `features` array when you're ready
 * to ship a scraper-bundled shape.
 */

const browserlessBody = `    image: ghcr.io/browserless/chromium:v2.48.0
    environment:
      TOKEN: \${BROWSER_TOKEN}
      CONCURRENT: \${BROWSERLESS_CONCURRENT:-3}
      QUEUED: \${BROWSERLESS_QUEUED:-6}
      TIMEOUT: \${BROWSERLESS_TIMEOUT:-60000}
    healthcheck:
      test: ['CMD-SHELL', 'curl -fsS -o /dev/null "http://localhost:3000/pressure?token=$$TOKEN" || exit 1']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    restart: unless-stopped
`

const scraperBody = `    image: \${SCRAPER_IMAGE:-ghcr.io/shawnphoffman/giftwrapt-scraper:latest}
    depends_on:
      browserless:
        condition: service_healthy
    environment:
      BROWSERLESS_URL: http://browserless:3000
      BROWSER_TOKEN: \${BROWSER_TOKEN}
      LOG_LEVEL: \${LOG_LEVEL:-info}
      MAX_RESPONSE_BYTES: \${MAX_RESPONSE_BYTES:-5242880}
      PER_HOST_CONCURRENCY: \${PER_HOST_CONCURRENCY:-2}
      RESPECT_ROBOTS: \${RESPECT_ROBOTS:-0}
    healthcheck:
      test: ['CMD-SHELL', 'wget -qO- http://localhost:8080/health || exit 1']
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 20s
    restart: unless-stopped
`

export const scraperFeature: ComposeFeature = {
	id: 'scraper',
	services: [
		{
			name: 'browserless',
			body: browserlessBody,
			leadingComment: `  # Headless Chromium engine. Drives the scraper facade; not reached directly
  # by core. Set BROWSER_TOKEN to a long random string and share it with the
  # scraper service below.`,
		},
		{
			name: 'scraper',
			body: scraperBody,
			leadingComment: `  # Scraper facade. The HTTP endpoint core's admin "Scrape provider" entry
  # talks to. Configure in core at /admin/settings -> Scrape providers:
  # type = giftwrapt-scraper, URL = http://scraper:8080, token = $BROWSER_TOKEN.`,
		},
	],
}

export const scraperEnvSection: EnvExampleSection = {
	id: 'scraper',
	body: `# -----------------------------------------------------------------------------
# Scraper sidecar - only used by *-scraper.yaml and *-full.yaml shapes
# -----------------------------------------------------------------------------
# Shared between browserless and the scraper facade. Generate:
#   openssl rand -hex 32
# BROWSER_TOKEN=change-me-to-a-random-token
#
# Tunables (all optional, with sensible defaults):
# BROWSERLESS_CONCURRENT=3
# BROWSERLESS_QUEUED=6
# BROWSERLESS_TIMEOUT=60000
# MAX_RESPONSE_BYTES=5242880
# PER_HOST_CONCURRENCY=2
# RESPECT_ROBOTS=0
#
# Override the published scraper image tag if you build locally.
# SCRAPER_IMAGE=ghcr.io/shawnphoffman/giftwrapt-scraper:latest
`,
}
