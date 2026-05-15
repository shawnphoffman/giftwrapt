import type { ComposeFeature } from '../types.ts'

type AppVariant = 'garage' | 'rustfs'

type AppOptions = {
	backend: AppVariant
	/**
	 * When true, the `ports:` block is commented out and Traefik routing
	 * labels are added. Used by the `*-traefik.yaml` shapes; Traefik fronts
	 * the app on :80 / :443, so direct host port exposure would just be a
	 * second ingress path.
	 */
	proxied?: boolean
}

/**
 * The `app` service block. Varies along two axes:
 *
 *   - storage backend (garage / rustfs) drives the bootstrap INIT_* env
 *     var and the depends_on storage service.
 *   - proxied (true / false) decides whether the app exposes a host port
 *     directly or whether Traefik fronts it via labels.
 *
 * The two storage variants still carry slightly different surrounding
 * comments inherited from the original hand-written files; preserved
 * here until a follow-up unifies them.
 */
export function appFeature(opts: AppVariant | AppOptions): ComposeFeature {
	const o = typeof opts === 'string' ? { backend: opts, proxied: false } : { proxied: false, ...opts }
	const base = o.backend === 'garage' ? garageAppBody : rustfsAppBody
	const body = o.proxied ? applyProxy(base) : base
	return {
		id: `app-${o.backend}${o.proxied ? '-proxied' : ''}`,
		services: [{ name: 'app', body }],
	}
}

/**
 * Convert the direct-port app body into a Traefik-proxied variant:
 *   - comment out the `ports:` block
 *   - inject `labels:` with the Traefik routing rules right after
 *
 * Done as a string transform rather than maintaining a third variant of
 * the app body so storage-backend edits land in one place.
 */
function applyProxy(body: string): string {
	const commentedPorts = body.replace(
		/^ {4}ports:\n {6}- '.+'\n/m,
		`    # Traefik fronts the app on \${TRAEFIK_HOST}; ports stay closed by
    # default so the only ingress is via the proxy. Uncomment to expose
    # the app port directly (handy for debugging).
    # ports:
    #   - '\${APP_PORT:-3001}:3001'
`
	)
	if (commentedPorts === body) {
		throw new Error('applyProxy: ports block not found in app body; the regex needs updating to match the current shape.')
	}
	const labels = `    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.giftwrapt.rule=Host(\`\${TRAEFIK_HOST:-giftwrapt.localhost}\`)"
      - "traefik.http.routers.giftwrapt.entrypoints=web"
      - "traefik.http.services.giftwrapt.loadbalancer.server.port=3001"
      # HTTPS (uncomment after enabling the websecure entrypoint in traefik):
      # - "traefik.http.routers.giftwrapt-secure.rule=Host(\`\${TRAEFIK_HOST}\`)"
      # - "traefik.http.routers.giftwrapt-secure.entrypoints=websecure"
      # - "traefik.http.routers.giftwrapt-secure.tls.certresolver=le"
`
	// Insert labels right before depends_on so the YAML stays in a familiar
	// order (image, env, ports/labels, depends_on, restart).
	return commentedPorts.replace(/^ {4}depends_on:/m, `${labels}    depends_on:`)
}

const garageAppBody = `    image: \${APP_IMAGE:-ghcr.io/shawnphoffman/giftwrapt:latest}
    env_file: .env
    environment:
      DATABASE_URL: postgresql://\${POSTGRES_USER:-postgres}:\${POSTGRES_PASSWORD}@postgres:5432/\${POSTGRES_DB:-giftwrapt}
      NODE_ENV: production
      # Structured logging. LOG_LEVEL can be flipped without a rebuild; valid
      # values: fatal|error|warn|info|debug|trace|silent. LOG_PRETTY forces
      # human-readable output even in prod (otherwise NDJSON is emitted).
      LOG_LEVEL: \${LOG_LEVEL:-info}
      LOG_PRETTY: \${LOG_PRETTY:-false}
      # When the bundled Garage sidecar is part of the stack, the app
      # entrypoint bootstraps it via Garage's admin HTTP API (layout assign,
      # bucket create, key import, permission grant) before running DB
      # migrations. Idempotent on re-run. Set to "false" (or omit) if you're
      # pointing STORAGE_* at an external S3-compatible bucket.
      INIT_GARAGE: \${INIT_GARAGE:-true}
    ports:
      - '\${APP_PORT:-3001}:3001'
    depends_on:
      postgres:
        condition: service_healthy
      # service_started, not service_healthy: the container's healthcheck
      # (\`garage status\`) returns non-zero on a fresh node with no layout
      # assigned, which is the exact state on cold boot before INIT_GARAGE
      # has had a chance to run. INIT_GARAGE itself runs from this app's
      # entrypoint and polls Garage's admin /health endpoint with a 60s
      # deadline (see scripts/init-garage.ts), so daemon-readiness is
      # already gated app-side; the docker dep just needs the process up.
      garage:
        condition: service_started
    # Health check is built into the image via HEALTHCHECK instruction.
    restart: unless-stopped
`

const rustfsAppBody = `    image: \${APP_IMAGE:-ghcr.io/shawnphoffman/giftwrapt:latest}
    env_file: .env
    environment:
      DATABASE_URL: postgresql://\${POSTGRES_USER:-postgres}:\${POSTGRES_PASSWORD}@postgres:5432/\${POSTGRES_DB:-giftwrapt}
      NODE_ENV: production
      LOG_LEVEL: \${LOG_LEVEL:-info}
      LOG_PRETTY: \${LOG_PRETTY:-false}
      # When the bundled RustFS sidecar is part of the stack, the app
      # entrypoint runs a bucket-create step (HeadBucket -> CreateBucket)
      # before DB migrations. Idempotent. Set to "false" (or omit) if
      # you're pointing STORAGE_* at an external S3-compatible bucket.
      INIT_RUSTFS: \${INIT_RUSTFS:-true}
    ports:
      - '\${APP_PORT:-3001}:3001'
    depends_on:
      postgres:
        condition: service_healthy
      rustfs:
        condition: service_started
    restart: unless-stopped
`
