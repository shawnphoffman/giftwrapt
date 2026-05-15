import type { ComposeFeature, EnvExampleSection } from '../types.ts'

const body = `    image: dxflrs/garage:v1.0.1
    environment:
      GARAGE_RPC_SECRET: \${GARAGE_RPC_SECRET}
      GARAGE_ADMIN_TOKEN: \${GARAGE_ADMIN_TOKEN}
    volumes:
      - garage_meta:/var/lib/garage/meta
      - garage_data:/var/lib/garage/data
      - ./garage.toml:/etc/garage.toml:ro
    # Intentionally no host port: Garage is only reachable on the compose
    # network. The app serves images via /api/files/* so clients never need
    # direct bucket access. If you want direct S3 URLs (faster, offloads
    # bandwidth), add a reverse-proxy rule for 3900 and set STORAGE_PUBLIC_URL
    # in .env - see https://giftwrapt.dev/configuration/storage/.
    healthcheck:
      test: ['CMD', '/garage', 'status']
      interval: 5s
      timeout: 5s
      retries: 20
    restart: unless-stopped
`

export const garageFeature: ComposeFeature = {
	id: 'garage',
	services: [{ name: 'garage', body }],
	volumes: ['garage_meta', 'garage_data'],
}

export const bundledGarageEnvSection: EnvExampleSection = {
	id: 'bundled-garage',
	body: `# -----------------------------------------------------------------------------
# Bundled Garage sidecar - only needed if Garage runs inside your compose
# -----------------------------------------------------------------------------
# Leave these blank if STORAGE_* points at R2, AWS, Supabase, or any other
# external S3 bucket.
#
# INIT_GARAGE triggers the app's built-in bootstrap (layout/bucket/key/grant)
# on every cold boot. Safe to leave on; the bootstrap short-circuits when
# each step already exists.
# INIT_GARAGE=true
#
# Secrets for the Garage daemon itself.
# Generate: openssl rand -hex 32
GARAGE_RPC_SECRET=change-me-to-a-64-char-hex-string
# Generate: openssl rand -hex 32
GARAGE_ADMIN_TOKEN=change-me-to-a-64-char-hex-string
# Where the bootstrap reaches the admin API. Defaults to the compose service
# name; override for local dev where Garage binds on localhost.
# GARAGE_ADMIN_URL=http://garage:3903`,
}
