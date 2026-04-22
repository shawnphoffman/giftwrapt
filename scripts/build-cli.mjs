import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import * as esbuild from 'esbuild'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

// Anything pulled in at runtime via dynamic require/native binding — mark
// external so esbuild doesn't try to bundle it and fail.
const external = [
	// pg's optional native binding. If absent, pg falls back to pure JS.
	'pg-native',
	// cloudflare:sockets is a runtime-resolved module used by pg in some edge
	// runtimes; not relevant for node but imported conditionally.
	'cloudflare:sockets',
]

// better-auth/tanstack-start reaches into TanStack Start's SSR surface via Vite
// virtual modules (#tanstack-router-entry, tanstack-start-manifest:v, etc).
// CLI scripts only touch signUpEmail and auth.$context, never the cookie /
// request-handler paths that would actually resolve these. Stub them to empty
// so the bundle links; runtime never calls into them.
const stubVirtuals = {
	name: 'stub-tanstack-virtuals',
	setup(build) {
		const filter = /^(#tanstack-(?:router|start)-entry$|tanstack-start-(?:manifest|injected-head-scripts|server-fn-manifest):)/
		build.onResolve({ filter }, args => ({ path: args.path, namespace: 'stub' }))
		build.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({
			contents: 'export default {}; export const routeTree = { children: [] };',
			loader: 'js',
		}))
	},
}

const entries = [
	{ in: resolve(root, 'scripts/migrate.ts'), out: 'migrate' },
	{ in: resolve(root, 'scripts/admin-create.ts'), out: 'admin-create' },
	{ in: resolve(root, 'scripts/admin-reset-password.ts'), out: 'admin-reset-password' },
	{ in: resolve(root, 'scripts/seed.ts'), out: 'seed' },
	{ in: resolve(root, 'scripts/init-garage.ts'), out: 'init-garage' },
]

// Single build with splitting:true so shared deps (drizzle-orm, pg, better-auth,
// dotenv, ...) land in chunk files imported by the four entrypoints instead of
// being duplicated four times. Keeps the public contract: every CLI is still
// invoked as `node .output/scripts/<name>.mjs`.
const start = Date.now()
const result = await esbuild.build({
	entryPoints: entries,
	outdir: resolve(root, '.output/scripts'),
	outExtension: { '.js': '.mjs' },
	chunkNames: '_chunks/[name]-[hash]',
	bundle: true,
	splitting: true,
	platform: 'node',
	format: 'esm',
	target: 'node20',
	external,
	plugins: [stubVirtuals],
	tsconfig: resolve(root, 'tsconfig.json'),
	logLevel: 'warning',
	banner: {
		// Node ESM doesn't polyfill __dirname / require. A few transitive deps
		// still use them, so provide shims.
		js: [
			"import { createRequire as __cr } from 'node:module';",
			"import { dirname as __dn } from 'node:path';",
			"import { fileURLToPath as __ftp } from 'node:url';",
			'const require = __cr(import.meta.url);',
			'const __filename = __ftp(import.meta.url);',
			'const __dirname = __dn(__filename);',
		].join('\n'),
	},
})

if (result.warnings.length) {
	for (const w of result.warnings) console.warn(w.text)
}

console.log(`Built ${entries.length} CLI scripts in ${Date.now() - start}ms`)
