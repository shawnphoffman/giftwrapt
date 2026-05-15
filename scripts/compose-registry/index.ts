/**
 * Generate the selfhost compose files and the `.env.example` from the
 * feature registry. See ./targets.ts for the feature -> file mapping.
 *
 * Usage:
 *   pnpm generate:compose
 *
 * Flags:
 *   --check   Exit non-zero if any output would change. CI uses this.
 *   --print   Show what would change without writing.
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'

import { emitCompose } from './emit-compose.ts'
import { emitEnv } from './emit-env.ts'
import { targets } from './targets.ts'

const root = resolve(import.meta.dirname, '../..')
const args = new Set(process.argv.slice(2))
const check = args.has('--check')
const dryRun = args.has('--print') || check

let changed = 0
for (const target of targets) {
	const next = target.kind === 'compose' ? emitCompose(target) : emitEnv(target)
	const rel = relative(root, target.outPath)

	let current = ''
	try {
		current = readFileSync(target.outPath, 'utf8')
	} catch {
		current = ''
	}

	if (current === next) {
		console.log(`= ${rel} (unchanged)`)
		continue
	}

	changed++
	console.log(`${check ? '!' : '~'} ${rel} (would change ${diffSummary(current, next)})`)
	if (!dryRun) writeFileSync(target.outPath, next)
}

if (check && changed > 0) {
	console.error(`\n${changed} file${changed === 1 ? '' : 's'} out of sync with the registry. Run \`pnpm generate:compose\` to fix.`)
	process.exit(1)
}

if (changed === 0) console.log('\nAll outputs already match the registry.')

function diffSummary(a: string, b: string): string {
	if (a === '') return `new file, ${b.length} bytes`
	const aLines = a.split('\n').length
	const bLines = b.split('\n').length
	const delta = bLines - aLines
	const sign = delta > 0 ? '+' : delta < 0 ? '' : '±0'
	return `${a.length}b → ${b.length}b, ${sign}${delta || ''} line${Math.abs(delta) === 1 ? '' : 's'}`
}
