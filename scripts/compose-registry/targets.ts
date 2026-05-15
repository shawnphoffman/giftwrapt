import { resolve } from 'node:path'

import { appFeature } from './features/app.ts'
import { authEnvSection } from './features/auth.ts'
import { cronEnvSection, cronFeature } from './features/cron.ts'
import { emailEnvSection } from './features/email.ts'
import { envExampleHeader } from './features/env-header.ts'
import { bundledGarageEnvSection, garageFeature } from './features/garage.ts'
import { clientEnvSection, imageOverrideEnvSection } from './features/logging.ts'
import { mcpEnvSection, mcpFeature } from './features/mcp.ts'
import { databaseEnvSection, postgresFeature } from './features/postgres.ts'
import { rustfsFeature } from './features/rustfs.ts'
// Scraper feature is wired but intentionally not included in any current
// shape or surfaced in `.env.example`. Re-import `scraperEnvSection` and
// add it to the env-target sections array (plus `scraperFeature` to a
// compose target's `features`) when we're ready to ship a scraper variant.
// import { scraperEnvSection } from './features/scraper.ts'
import { storageEnvSection } from './features/storage-external.ts'
import { traefikEnvSection, traefikFeature } from './features/traefik.ts'
import type { ComposeFeature, ComposeTarget, Target } from './types.ts'

const root = resolve(import.meta.dirname, '../..')

/**
 * Storage backend axis. Each backend brings its own sidecar service and
 * drives the app's `INIT_*` env var. External-S3 deployments (R2 / AWS /
 * Supabase) don't generate a file here today - they reuse one of the
 * bundled-storage files with `STORAGE_*` re-pointed at the external bucket
 * and `INIT_*` set to false. Add an `'external'` backend here when we
 * want a no-sidecar variant.
 */
type Backend = 'garage' | 'rustfs'

/**
 * Shape axis. Each shape composes a set of optional sidecars on top of
 * the always-required core (app + postgres + storage backend).
 *
 *   minimal  - just core
 *   cron     - + cron sidecar
 *   full     - + cron (always-on) + MCP (profile-gated; opt in with `--profile mcp`)
 *   traefik  - + Traefik reverse-proxy; app ports closed, routed via labels
 *
 * Scraper is a feature module ready to go but not currently included in
 * any shape - add it to `shapeOptionals` when ready.
 */
type Shape = 'minimal' | 'cron' | 'full' | 'traefik'

const shapeOptionals: Record<Shape, ReadonlyArray<(backend: Backend) => ComposeFeature>> = {
	minimal: [],
	cron: [backend => cronFeature(backend)],
	full: [backend => cronFeature(backend), () => mcpFeature],
	traefik: [() => traefikFeature],
}

const shapeProxied: Record<Shape, boolean> = {
	minimal: false,
	cron: false,
	full: false,
	traefik: true,
}

const backendLabel: Record<Backend, string> = {
	garage: 'Garage',
	rustfs: 'RustFS',
}

const shapeLabel: Record<Shape, string> = {
	minimal: 'bare minimum (app + DB + storage)',
	cron: 'with cron sidecar',
	full: 'full (cron + profile-gated MCP)',
	traefik: 'with Traefik reverse-proxy',
}

const shapeFilenamePart: Record<Shape, string> = {
	minimal: 'minimal',
	cron: 'cron',
	full: 'full',
	traefik: 'traefik',
}

const shapeIncludes: Record<Shape, string> = {
	minimal: 'No optional sidecars - add an MCP or cron block manually if you need one, or grab a richer shape.',
	cron: 'Includes the cron sidecar that hits /api/cron/* on a daily schedule.',
	full: 'Includes the cron sidecar always-on AND the MCP sidecar profile-gated. Pass `--profile mcp` to bring MCP up.',
	traefik: 'Fronts the app with Traefik on :80. App ports are closed; ingress is via the proxy. Set TRAEFIK_HOST in .env.',
}

function backendStorageQuickStart(backend: Backend): string {
	if (backend === 'garage') {
		return [
			'#   3. Set GARAGE_RPC_SECRET and GARAGE_ADMIN_TOKEN (see .env.example).',
			'#      The app bootstraps the bucket and access key on first boot.',
		].join('\n')
	}
	return [
		'#   3. Set STORAGE_ENDPOINT=http://rustfs:9000, STORAGE_REGION=us-east-1,',
		'#      STORAGE_BUCKET=giftwrapt, plus any STORAGE_ACCESS_KEY_ID and',
		'#      STORAGE_SECRET_ACCESS_KEY (RustFS accepts arbitrary strings).',
		'#      STORAGE_FORCE_PATH_STYLE=true.',
	].join('\n')
}

function targetFor(backend: Backend, shape: Shape): ComposeTarget {
	const fileName = `compose.selfhost-${backend}-${shapeFilenamePart[shape]}.yaml`
	const storageFeature = backend === 'garage' ? garageFeature : rustfsFeature
	const features: Array<ComposeFeature> = [
		appFeature({ backend, proxied: shapeProxied[shape] }),
		postgresFeature,
		...shapeOptionals[shape].map(f => f(backend)),
		storageFeature,
	]

	const header = `# =============================================================================
# Self-Hosted (${backendLabel[backend]} backend, ${shapeLabel[shape]})
# =============================================================================
# ${shapeIncludes[shape]}
#
# Quick start:
#   1. cp env.example docker/.env
#   2. Edit docker/.env - at minimum set POSTGRES_PASSWORD, BETTER_AUTH_SECRET,
#      and BETTER_AUTH_URL (the public URL you'll reach the app from).
${backendStorageQuickStart(backend)}
#   4. docker compose -f docker/${fileName} up -d
#   5. Open BETTER_AUTH_URL in your browser and sign up.
#
# Generated by \`pnpm generate:compose\` from scripts/compose-registry/.
# Add or change features in scripts/compose-registry/features/<id>.ts.

`

	return {
		kind: 'compose',
		outPath: resolve(root, `docker/${fileName}`),
		header,
		features,
	}
}

const backends: Array<Backend> = ['garage', 'rustfs']
const shapes: Array<Shape> = ['minimal', 'cron', 'full', 'traefik']

const composeTargets: Array<ComposeTarget> = backends.flatMap(b => shapes.map(s => targetFor(b, s)))

export const targets: ReadonlyArray<Target> = [
	...composeTargets,
	{
		kind: 'env',
		outPath: resolve(root, '.env.example'),
		header: envExampleHeader,
		sections: [
			databaseEnvSection,
			authEnvSection,
			emailEnvSection,
			cronEnvSection,
			imageOverrideEnvSection,
			clientEnvSection,
			mcpEnvSection,
			// scraperEnvSection, // re-enable when a shape ships with scraper
			traefikEnvSection,
			storageEnvSection,
			bundledGarageEnvSection,
		],
	},
]
