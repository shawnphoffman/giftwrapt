import { readFileSync } from 'node:fs'
import { resolve as resolvePath } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { visualizer } from 'rollup-plugin-visualizer'
import type { Plugin, PluginOption } from 'vite'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const isStorybook = process.env.STORYBOOK === 'true'

// Build-time identity. Baked into the bundle once and read by the admin debug
// page. APP_COMMIT comes from the Docker build-arg in CI; on Vercel it falls
// back to VERCEL_GIT_COMMIT_SHA; in plain `git`-aware environments to GITHUB_SHA.
const pkgJson = JSON.parse(readFileSync(resolvePath(__dirname, 'package.json'), 'utf8')) as { version: string }
const buildCommit = process.env.APP_COMMIT || process.env.VERCEL_GIT_COMMIT_SHA || process.env.GITHUB_SHA || ''
process.env.VITE_APP_VERSION = pkgJson.version
process.env.VITE_APP_COMMIT = buildCommit
process.env.VITE_APP_BUILD_TIME = new Date().toISOString()

// Vercel deployment metadata. Only forwarded when building on Vercel so the
// admin debug page can hide the section entirely on non-Vercel builds.
if (process.env.VERCEL) {
	process.env.VITE_VERCEL_ENV = process.env.VERCEL_ENV ?? ''
	process.env.VITE_VERCEL_URL = process.env.VERCEL_URL ?? ''
	process.env.VITE_VERCEL_BRANCH_URL = process.env.VERCEL_BRANCH_URL ?? ''
	process.env.VITE_VERCEL_GIT_COMMIT_REF = process.env.VERCEL_GIT_COMMIT_REF ?? ''
	process.env.VITE_VERCEL_GIT_REPO_SLUG = process.env.VERCEL_GIT_REPO_SLUG ?? ''
	process.env.VITE_VERCEL_DEPLOYMENT_ID = process.env.VERCEL_DEPLOYMENT_ID ?? ''
	process.env.VITE_VERCEL_PROJECT_PRODUCTION_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? ''
}

// Content-Security-Policy is NOT set here: it depends on the runtime env
// (SENTRY_DSN, VERCEL_ENV), so server/plugins/security-headers.ts builds it at
// server start from src/lib/csp.ts. A prebuilt image would otherwise keep
// whatever env it was built with.
const securityHeaders = {
	// HSTS is a no-op over HTTP (browsers ignore it per RFC 6797). Useful once
	// the deployment is fronted by HTTPS: tells browsers to refuse plaintext.
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	// No upgrade-insecure-requests (here or in the CSP): it rewrites every
	// http:// subresource to https:// even when the page itself is served over
	// http, which breaks IP:port/LAN self-hosts. If you front the app with
	// HTTPS, add it via the reverse proxy and everything still works.
}

// Custom plugin: redirect `@/db` to a throwing client stub when bundling
// for the browser environment. Without this, any file-route or server-fn
// module that does `import { db } from '@/db'` at top level keeps
// `src/db/index.ts` alive in the client graph (pg's `new Pool(...)` is a
// module-level side effect, so Rollup can't tree-shake the import even
// after handler bodies are stripped). Hooking `resolveId` directly with
// `enforce: 'pre'` runs before `vite-tsconfig-paths`, which would
// otherwise resolve `@/db` to the real `src/db/index.ts` via the
// tsconfig `@/*` path alias.
const dbStubPath = resolvePath(__dirname, 'src/db/_client-stub.ts')
const appSecretStubPath = resolvePath(__dirname, 'src/lib/crypto/_client-stub.ts')
const dbClientAlias = (): Plugin => ({
	name: 'wishlists:client-db-alias',
	enforce: 'pre',
	resolveId(source) {
		if (this.environment.name !== 'client') return
		if (source === '@/db') return dbStubPath
		// `@/lib/crypto/app-secret` does `import { scryptSync } from 'node:crypto'`,
		// which Vite externalises in the browser and rollup then errors on. The
		// helpers only run server-side (server-fn handlers, cron, Hono routes);
		// alias the import to a throwing stub so it never reaches the client graph.
		if (source === '@/lib/crypto/app-secret') return appSecretStubPath
		return null
	},
})

// Bundle-size visualizer. Off by default; flip on with `ANALYZE=1 pnpm build`
// to emit separate treemap reports per environment. The reports land at
// `dist/{client,ssr}-stats.html`; diff them across commits to verify that a
// bundle-targeted change actually landed.
const analyzeEnabled = process.env.ANALYZE === '1'
const visualizerForEnv = (envName: 'client' | 'ssr'): PluginOption =>
	visualizer({
		filename: `dist/${envName}-stats.html`,
		template: 'treemap',
		gzipSize: true,
		brotliSize: true,
		title: `giftwrapt ${envName} bundle`,
	}) as PluginOption

const config = defineConfig({
	// Stagehand (an optional dep used only at runtime via dynamic
	// `await import()` in the browserbase-stagehand provider) and its
	// transitive `playwright-core` pull in optional native modules
	// (chromium-bidi/*) that aren't installed by default. Vite's dev-mode
	// pre-bundle pass scans those even though we never reach them
	// statically; excluding them here keeps the dev server happy without
	// affecting production builds (where Nitro handles externalization).
	optimizeDeps: {
		exclude: ['@browserbasehq/stagehand', 'playwright-core', 'chromium-bidi'],
		// Force-prebundle so it shares the host React instance under
		// dev. Without this we hit "Cannot read properties of null
		// (reading 'useState')" because the dep ships its own copy.
		include: ['@tanstack/react-table'],
	},
	ssr: {
		noExternal: [],
		external: ['@browserbasehq/stagehand', 'playwright-core', 'chromium-bidi'],
	},
	...(analyzeEnabled && {
		environments: {
			client: { build: { rollupOptions: { plugins: [visualizerForEnv('client')] } } },
			ssr: { build: { rollupOptions: { plugins: [visualizerForEnv('ssr')] } } },
		},
	}),
	plugins: [
		dbClientAlias(),
		!isStorybook &&
			nitro({
				// Registered explicitly rather than relying on server/plugins/
				// auto-discovery, which depends on Nitro's srcDir and isn't
				// guaranteed when Nitro is used as a Vite plugin.
				plugins: [
					'./server/plugins/sentry.ts',
					'./server/plugins/logging.ts',
					'./server/plugins/storage-boot.ts',
					'./server/plugins/security-headers.ts',
				],
				// Sharp is a native CJS addon. Nitro's default node_modules
				// tracing copies it into .output/server/node_modules/sharp at
				// build time, which is what the runtime image relies on (see
				// Dockerfile note about the self-contained .output bundle).
				// traceDeps forces the include even if static analysis misses it.
				traceDeps: ['sharp'],
				// The `vercel` preset inlines node_modules, so Stagehand's
				// `playwright-core` lands in this bundle (the `ssr.external`
				// above only covers the SSR environment). playwright-core
				// >= 1.64 does `import("kerberos")` for proxy auth, an optional
				// native dep we never install; left unresolved it fails the build.
				rollupConfig: {
					external: ['kerberos'],
				},
				routeRules: {
					'/**': { headers: securityHeaders },
				},
			}),
		// this is the plugin that enables path aliases
		viteTsConfigPaths({
			projects: ['./tsconfig.json'],
		}),
		tailwindcss(),
		!isStorybook && tanstackStart(),
		viteReact({
			babel: {
				plugins: ['babel-plugin-react-compiler'],
			},
		}),
	].filter(Boolean),
})

export default config
