import type { ComposeFeature, EnvExampleSection } from '../types.ts'

/**
 * Basic Traefik reverse-proxy. HTTP-only out of the box; HTTPS via
 * Let's Encrypt is wired up but commented so a fresh deploy doesn't
 * require DNS setup on day one.
 *
 * When this feature is present in a shape, the `app` service:
 *   - has its host port mapping commented out (Traefik handles ingress)
 *   - carries Traefik labels for routing (handled by `appFeature` when
 *     called with { proxied: true }, not here)
 *
 * Deployer steps:
 *   1. Point a DNS A record at the host running this stack.
 *   2. Set TRAEFIK_HOST to that hostname in .env.
 *   3. Set BETTER_AUTH_URL to http://<host> (or https://<host> after
 *      enabling the websecure entrypoint).
 *   4. \`docker compose up -d\`. Traefik routes :80 to the app via labels.
 */

const leadingComment = `  # Traefik reverse-proxy. Routes inbound :80 (and optionally :443) to the
  # app via Docker labels - no static config file needed. HTTPS via Let's
  # Encrypt is preconfigured but commented out so day-one deploys don't
  # require DNS first. Uncomment the websecure entrypoint, the ACME
  # resolver lines, the :443 port mapping, and the letsencrypt volume to
  # turn it on; then set ACME_EMAIL.`

const body = `    image: traefik:v3.1
    command:
      - "--providers.docker=true"
      - "--providers.docker.exposedbydefault=false"
      - "--entrypoints.web.address=:80"
      # HTTPS (uncomment to enable; also uncomment :443, letsencrypt volume,
      # and the *-secure router labels on the app service):
      # - "--entrypoints.websecure.address=:443"
      # - "--certificatesresolvers.le.acme.tlschallenge=true"
      # - "--certificatesresolvers.le.acme.email=\${ACME_EMAIL}"
      # - "--certificatesresolvers.le.acme.storage=/letsencrypt/acme.json"
    ports:
      - "\${TRAEFIK_HTTP_PORT:-80}:80"
      # - "\${TRAEFIK_HTTPS_PORT:-443}:443"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      # - traefik_letsencrypt:/letsencrypt
    restart: unless-stopped
`

export const traefikFeature: ComposeFeature = {
	id: 'traefik',
	services: [{ name: 'traefik', body, leadingComment }],
	// `traefik_letsencrypt` volume stays commented in the body; declaring it
	// here would force-create it even when HTTPS is disabled. Uncomment the
	// volume mount AND add `traefik_letsencrypt:` to the volumes list when
	// you turn on Let's Encrypt.
}

export const traefikEnvSection: EnvExampleSection = {
	id: 'traefik',
	body: `# -----------------------------------------------------------------------------
# Traefik reverse-proxy - only used by *-traefik.yaml shapes
# -----------------------------------------------------------------------------
# Public hostname Traefik routes to the app. Set this to the DNS name
# pointing at the host running the stack (e.g. giftwrapt.example.com).
# Defaults to giftwrapt.localhost for local testing without DNS.
# TRAEFIK_HOST=giftwrapt.localhost

# Host ports Traefik binds. Override if 80 / 443 are already in use.
# TRAEFIK_HTTP_PORT=80
# TRAEFIK_HTTPS_PORT=443

# Required only when you enable the HTTPS entrypoint in the traefik
# service's command list. Used for Let's Encrypt registration / renewal.
# ACME_EMAIL=ops@example.com

# Remember: when Traefik fronts the app, set BETTER_AUTH_URL to the public
# URL it serves (http://\${TRAEFIK_HOST} or https://\${TRAEFIK_HOST}), not
# http://localhost:3001.
`,
}
