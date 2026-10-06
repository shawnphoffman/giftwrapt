import type { ComposeFeature, EnvExampleSection } from '../types.ts'

/**
 * Scraper sidecar. Two services: `browserless` (the headless Chromium
 * engine) and `scraper` (the GiftWrapt Scraper gateway that core talks
 * to). Modeled after the sibling giftwrapt-scraper repo's compose file
 * but pared down to the minimum needed for a self-hosted core deployment:
 * the optional challenge-solver rungs and the remote rendering API are
 * intentionally omitted. Operators who want those should run the full
 * giftwrapt-scraper stack separately and point a provider entry at it.
 *
 * Core consumes the gateway via a "GiftWrapt Scraper" entry in the admin
 * scrape-provider list (type=giftwrapt-scraper, see src/lib/settings.ts).
 * Shapes that include this feature also set SCRAPER_URL on the app
 * service (see features/app.ts), and on first boot the app seeds that
 * entry from SCRAPER_URL + BROWSER_TOKEN (src/db/bootstrap.ts), so the
 * stack works with no admin clicks. After that the admin UI owns it.
 */

const browserlessBody = `    image: ghcr.io/browserless/chromium:v2.55.3
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
      # BROWSER_TOKEN is the secret shared with the headless engine above.
      # BROWSER_TOKENS is the list of tokens the gateway accepts from
      # callers; a single-token deployment reuses the same value.
      BROWSER_TOKEN: \${BROWSER_TOKEN}
      BROWSER_TOKENS: \${BROWSER_TOKENS:-\${BROWSER_TOKEN}}
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
			leadingComment: `  # Headless Chromium engine. Drives the scraper gateway; not reached directly
  # by the app. Set BROWSER_TOKEN in .env to a long random string; the gateway
  # service below shares it. Budget roughly 1 GB of RAM for this container.`,
		},
		{
			name: 'scraper',
			body: scraperBody,
			leadingComment: `  # Scraper gateway. Renders pages the app's plain fetch can't (client-side
  # rendering, interstitials). The app reaches it at http://scraper:8080 via
  # SCRAPER_URL and seeds a "GiftWrapt Scraper" provider entry on first boot;
  # after that, manage it under Admin > Scraping.`,
		},
	],
}

export const scraperEnvSection: EnvExampleSection = {
	id: 'scraper',
	body: `# -----------------------------------------------------------------------------
# Scraper gateway - only used by the *-full.yaml shapes
# -----------------------------------------------------------------------------
# Shared secret between the headless engine and the scraper gateway, and
# the token the app presents to the gateway. Required by the full shapes;
# the stack will not come up without it. Generate:
#   openssl rand -hex 32
# BROWSER_TOKEN=change-me-to-a-random-token
#
# Where the app reaches the gateway. The full shapes default this to the
# bundled service; set it explicitly to point at a gateway running
# elsewhere (another host, a Tailscale peer, a tunnel). On first boot the
# app seeds a "GiftWrapt Scraper" provider entry from SCRAPER_URL +
# BROWSER_TOKEN if none exists yet; afterwards the admin UI owns it.
# SCRAPER_URL=http://scraper:8080
#
# Tunables (all optional, with sensible defaults):
# BROWSERLESS_CONCURRENT=3
# BROWSERLESS_QUEUED=6
# BROWSERLESS_TIMEOUT=60000
# MAX_RESPONSE_BYTES=5242880
# PER_HOST_CONCURRENCY=2
# RESPECT_ROBOTS=0
#
# Override the published gateway image tag if you build locally.
# SCRAPER_IMAGE=ghcr.io/shawnphoffman/giftwrapt-scraper:latest
`,
}
