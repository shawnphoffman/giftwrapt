import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Static-analysis test: walks every server-fn declaration under `src/api/`
// and asserts each one is wrapped in `authMiddleware` or `adminAuthMiddleware`
// (or appears in `PUBLIC_ALLOW_LIST` with a documented reason). Catches the
// "forgot to wrap" regression without firing 80 separate integration tests.
//
// Cron route handlers under `src/routes/api/cron/` get a separate, lighter
// check: each must reference `checkCronAuth` so unauthorized callers are
// rejected before any side effect.

const API_DIR = path.resolve(__dirname, '..')
const CRON_DIR = path.resolve(__dirname, '../../routes/api/cron')

// `${file}:${exportName}` keys for server fns that are intentionally
// unauthenticated. Each entry needs a one-line reason in the comment.
const PUBLIC_ALLOW_LIST: ReadonlyMap<string, string> = new Map([
	// Public app settings prefetched on every request including signed-out;
	// `scrapeProviders` is stripped before serialization (see settings.ts).
	['settings.ts:fetchAppSettings', 'public app settings, scrapeProviders stripped'],
	// Boolean health probe for the email integration. No PII, no DB writes.
	['common.ts:isEmailConfigured', 'public boolean health probe'],
	// Boolean health probe for object storage config. Driven by env, no I/O.
	['storage-status.ts:fetchStorageStatus', 'public boolean health probe'],
	// Public OIDC button info for the sign-in page (used before auth).
	['admin-oidc-client.ts:fetchPublicOidcClientInfo', 'public sign-in button info, no secrets'],
])

type ServerFn = {
	file: string
	name: string
	chain: string
}

function readApiFiles(): Array<{ file: string; source: string }> {
	return readdirSync(API_DIR)
		.filter(name => name.endsWith('.ts'))
		.filter(name => !name.startsWith('_'))
		.filter(name => !name.startsWith('__'))
		.map(name => ({
			file: name,
			source: readFileSync(path.join(API_DIR, name), 'utf8'),
		}))
}

function extractServerFns(file: string, source: string): Array<ServerFn> {
	const fns: Array<ServerFn> = []
	const declRe = /export\s+const\s+(\w+)\s*=\s*createServerFn\s*\(/g
	const matches: Array<{ name: string; index: number }> = []
	let m: RegExpExecArray | null
	while ((m = declRe.exec(source)) !== null) matches.push({ name: m[1], index: m.index })

	for (let i = 0; i < matches.length; i++) {
		const start = matches[i].index
		const end = i + 1 < matches.length ? matches[i + 1].index : source.length
		fns.push({ file, name: matches[i].name, chain: source.slice(start, end) })
	}
	return fns
}

function findMiddlewareArray(chain: string): string | null {
	const idx = chain.indexOf('.middleware(')
	if (idx === -1) return null
	const open = chain.indexOf('[', idx)
	if (open === -1) return null
	let depth = 0
	for (let i = open; i < chain.length; i++) {
		const c = chain[i]
		if (c === '[') depth++
		else if (c === ']') {
			depth--
			if (depth === 0) return chain.slice(open + 1, i)
		}
	}
	return null
}

describe('server-fn auth boundary', () => {
	const files = readApiFiles()

	it('finds api files to inspect', () => {
		expect(files.length).toBeGreaterThan(10)
	})

	const allFns = files.flatMap(({ file, source }) => extractServerFns(file, source))

	it('finds server-fn declarations across api/', () => {
		// Smoke check: if the regex stops matching, every other test below
		// becomes a vacuous pass. Bail loudly.
		expect(allFns.length).toBeGreaterThan(50)
	})

	it.each(allFns)('$file:$name has an auth middleware (or is allow-listed)', ({ file, name, chain }) => {
		const key = `${file}:${name}`
		if (PUBLIC_ALLOW_LIST.has(key)) {
			// Sanity: an allow-listed fn must NOT also be using authMiddleware
			// (that would mean the allow-list entry is stale).
			const mw = findMiddlewareArray(chain)
			if (mw && /\bauthMiddleware\b/.test(mw)) {
				throw new Error(`${key} is in PUBLIC_ALLOW_LIST but also wraps authMiddleware. Remove the allow-list entry.`)
			}
			return
		}

		const mw = findMiddlewareArray(chain)
		expect(mw, `${key}: missing .middleware([...]) call`).not.toBeNull()
		const hasAuth = /\bauthMiddleware\b/.test(mw!) || /\badminAuthMiddleware\b/.test(mw!)
		expect(
			hasAuth,
			`${key}: middleware chain does not include authMiddleware or adminAuthMiddleware. ` +
				`Add one, or document why this is public by adding "${key}" to PUBLIC_ALLOW_LIST in this test.`
		).toBe(true)
	})
})

describe('cron route auth boundary', () => {
	const files = readdirSync(CRON_DIR)
		.filter(n => n.endsWith('.ts'))
		.filter(n => !n.startsWith('_'))
		.map(name => ({ file: name, source: readFileSync(path.join(CRON_DIR, name), 'utf8') }))

	it('finds cron route files', () => {
		expect(files.length).toBeGreaterThan(0)
	})

	it.each(files)('$file calls checkCronAuth before any handler work', ({ file, source }) => {
		// The handler must reference checkCronAuth somewhere. We don't
		// enforce ordering with this static check (call site is expected
		// to early-return on the auth response), but the integration tests
		// in `__tests__/<handler>.integration.test.ts` exercise the 401 path.
		expect(source, `${file}: handler does not import checkCronAuth`).toMatch(/\bcheckCronAuth\b/)
	})
})
