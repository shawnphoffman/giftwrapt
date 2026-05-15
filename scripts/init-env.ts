/**
 * Bootstrap local env files (`.env.local`, `.env.local.screenshots`) from
 * their checked-in `*.example` templates and replace any placeholder secrets
 * with cryptographically-random values.
 *
 * Idempotent: only replaces values that exactly match a known placeholder
 * string. Real values you've set are left alone, so running this twice (or
 * after manually editing) is safe.
 *
 * The two templates serve different stand-ups:
 *   .env.local.example              — bundled docker-compose.yaml dev stack
 *   .env.local.screenshots.example  — screenshot generator (separate DB + port)
 *
 * For self-hosted Docker deploys see `.env.example` instead; that template
 * uses in-cluster hostnames and is not bootstrapped by this script.
 *
 * Usage:
 *   pnpm setup:env
 *
 * Flags:
 *   --force   Replace secrets even if they don't match a known placeholder.
 *             Useful for "rotate every secret in every file."
 *   --print   Show what would change without writing.
 */

import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')

type Target = {
	example: string
	target: string
}

const targets: ReadonlyArray<Target> = [
	{ example: resolve(root, '.env.local.example'), target: resolve(root, '.env.local') },
	{ example: resolve(root, '.env.local.screenshots.example'), target: resolve(root, '.env.local.screenshots') },
]

const force = process.argv.includes('--force')
const dryRun = process.argv.includes('--print')

// Each entry: which env var, the placeholder it ships with, and how to mint a
// real value. Both templates use the same placeholder strings so one spec list
// covers both.
type Spec = {
	key: string
	placeholders: ReadonlyArray<string>
	generate: () => string
}

const hex = (bytes: number) => randomBytes(bytes).toString('hex')

const specs: ReadonlyArray<Spec> = [
	{
		key: 'BETTER_AUTH_SECRET',
		placeholders: ['replace-with-random-secret'],
		generate: () => randomBytes(36).toString('base64url'),
	},
	{
		key: 'CRON_SECRET',
		placeholders: ['replace-with-random-secret'],
		generate: () => randomBytes(36).toString('base64url'),
	},
	{
		key: 'STORAGE_ACCESS_KEY_ID',
		placeholders: ['GKreplace-with-24-hex-chars'],
		generate: () => `GK${hex(12)}`,
	},
	{
		key: 'STORAGE_SECRET_ACCESS_KEY',
		placeholders: ['replace-with-64-hex-chars'],
		generate: () => hex(32),
	},
	{
		key: 'GARAGE_RPC_SECRET',
		placeholders: ['replace-with-64-hex-chars'],
		generate: () => hex(32),
	},
	{
		key: 'GARAGE_ADMIN_TOKEN',
		placeholders: ['replace-with-64-hex-chars'],
		generate: () => hex(32),
	},
]

function rewrite(input: string): { output: string; changes: Array<{ key: string; before: string; after: string }> } {
	const changes: Array<{ key: string; before: string; after: string }> = []
	const lines = input.split('\n')

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		// Only touch uncommented KEY=VALUE lines. Leave comments and commented-out
		// examples untouched so the file stays readable as documentation.
		const match = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
		if (!match) continue

		const [, key, value] = match
		const spec = specs.find(s => s.key === key)
		if (!spec) continue

		const shouldReplace = force || spec.placeholders.includes(value)
		if (!shouldReplace) continue

		const next = spec.generate()
		lines[i] = `${key}=${next}`
		// Mask both sides for the printed diff so we don't dump secrets to the
		// terminal (and to scrollback / shell history).
		changes.push({ key, before: mask(value), after: mask(next) })
	}

	return { output: lines.join('\n'), changes }
}

function mask(v: string): string {
	if (v.length <= 8) return '***'
	return `${v.slice(0, 4)}...${v.slice(-2)} (${v.length} chars)`
}

function processTarget({ example, target }: Target): void {
	const targetName = basename(target)
	const exampleName = basename(example)

	if (!existsSync(target) && !existsSync(example)) {
		console.log(`⚠️  Skipping ${targetName}: neither it nor ${exampleName} exists.`)
		return
	}

	const source = existsSync(target)
		? (console.log(`\n📝 ${targetName}`), readFileSync(target, 'utf8'))
		: (console.log(`\n✨ ${targetName} (creating from ${exampleName})`), readFileSync(example, 'utf8'))

	const { output, changes } = rewrite(source)

	if (changes.length === 0) {
		console.log(`   ✅ No placeholders found; nothing to replace.`)
		if (!existsSync(target)) {
			// First-time bootstrap with no placeholders — still need to write the
			// file so the user has something to work from.
			if (dryRun) {
				console.log(`   (dry run — would write ${target})`)
				return
			}
			writeFileSync(target, output)
			console.log(`   ✅ Wrote ${target}`)
		}
		return
	}

	console.log(`   Replacing ${changes.length} value${changes.length === 1 ? '' : 's'}:`)
	for (const c of changes) {
		console.log(`     ${c.key}: ${c.before} → ${c.after}`)
	}
	if (dryRun) {
		console.log(`   (dry run — not writing)`)
		return
	}
	writeFileSync(target, output)
	console.log(`   ✅ Wrote ${target}`)
}

for (const t of targets) processTarget(t)
