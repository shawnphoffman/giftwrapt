import { readFileSync, statSync } from 'node:fs'
import { join, resolve as resolvePath } from 'node:path'

import tailwindcss from '@tailwindcss/vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import viteTsConfigPaths from 'vite-tsconfig-paths'

const isStorybook = process.env.STORYBOOK === 'true'

// Default on in the main checkout, off in git worktrees (they multiply dev
// servers and each devtools instance binds its own WS port).
// Explicit wins: VITE_TANSTACK_DEVTOOLS (e.g. from .env.local) then TANSTACK_DEVTOOLS.
function shouldEnableDevtools(): boolean {
	const viteExplicit = process.env.VITE_TANSTACK_DEVTOOLS?.toLowerCase()
	if (viteExplicit === 'false' || viteExplicit === '0') return false
	if (viteExplicit === 'true' || viteExplicit === '1') return true

	const flag = process.env.TANSTACK_DEVTOOLS?.toLowerCase()
	if (flag === '1' || flag === 'true' || flag === 'on') return true
	if (flag === '0' || flag === 'false' || flag === 'off') return false
	try {
		// In a main checkout .git is a directory; in a worktree it's a file
		// pointing at <common-dir>/worktrees/<name>.
		return statSync(join(process.cwd(), '.git')).isDirectory()
	} catch {
		return true
	}
}

const devtoolsEnabled = shouldEnableDevtools()
// Bakes into the client bundle; __root reads import.meta.env.VITE_TANSTACK_DEVTOOLS.
// Env files can set VITE_TANSTACK_DEVTOOLS or TANSTACK_DEVTOOLS (see shouldEnableDevtools).
process.env.VITE_TANSTACK_DEVTOOLS = String(devtoolsEnabled)

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

const securityHeaders = {
	// HSTS is a no-op over HTTP (browsers ignore it per RFC 6797). Useful once
	// the deployment is fronted by HTTPS: tells browsers to refuse plaintext.
	'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
	// No upgrade-insecure-requests: it rewrites every http:// subresource to
	// https:// even when the page itself is served over http, which breaks
	// IP:port/LAN self-hosts. If you front the app with HTTPS, add it via the
	// reverse proxy (or add it back here) and everything still works.
	'Content-Security-Policy': [
		"default-src 'self'",
		// 'unsafe-eval' is needed by something in the production bundle (a wasm
		// shim or one of the @tanstack libs); blocking it surfaces as an
		// uncaught CSP error and a stuck loading spinner.
		"script-src 'self' 'unsafe-inline' 'unsafe-eval' https://vercel.live",
		"style-src 'self' 'unsafe-inline'",
		"img-src 'self' data: https:",
		"font-src 'self' data:",
		"connect-src 'self' https://vercel.live wss://ws-us3.pusher.com",
		'frame-src https://vercel.live',
		"object-src 'none'",
		"base-uri 'self'",
		"form-action 'self'",
		"frame-ancestors 'none'",
	].join('; '),
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
const dbClientAlias = (): Plugin => ({
	name: 'wishlists:client-db-alias',
	enforce: 'pre',
	resolveId(source) {
		if (this.environment.name !== 'client') return
		if (source === '@/db') return dbStubPath
		return null
	},
})

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
	plugins: [
		dbClientAlias(),
		!isStorybook && devtoolsEnabled && devtools(),
		!isStorybook &&
			nitro({
				// Registered explicitly rather than relying on server/plugins/
				// auto-discovery, which depends on Nitro's srcDir and isn't
				// guaranteed when Nitro is used as a Vite plugin.
				plugins: ['./server/plugins/logging.ts', './server/plugins/storage-boot.ts'],
				// Sharp is a native CJS addon. Nitro's default node_modules
				// tracing copies it into .output/server/node_modules/sharp at
				// build time, which is what the runtime image relies on (see
				// Dockerfile note about the self-contained .output bundle).
				// traceDeps forces the include even if static analysis misses it.
				traceDeps: ['sharp'],
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
