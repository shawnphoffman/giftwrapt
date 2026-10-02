// Every model call must go through src/lib/ai-call.ts so it lands on the
// usage ledger. This fails the moment another file imports a generate /
// stream function straight from the SDK.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

import { describe, expect, it } from 'vitest'

const SRC = join(__dirname, '..', '..')
const ALLOWED = new Set(['lib/ai-call.ts'])
const CALL_FNS = /\b(?:generateText|generateObject|streamText|streamObject|embed|embedMany)\b/u

function sourceFiles(dir: string): Array<string> {
	const out: Array<string> = []
	for (const name of readdirSync(dir)) {
		if (name === '__tests__' || name === 'node_modules') continue
		const full = join(dir, name)
		if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
		else if (/\.tsx?$/u.test(name) && !/\.(?:test|stories)\.tsx?$/u.test(name)) out.push(full)
	}
	return out
}

describe('model calls go through ai-call.ts', () => {
	it('no other source file imports a call function from the AI SDK', () => {
		const offenders: Array<string> = []
		for (const file of sourceFiles(SRC)) {
			const rel = relative(SRC, file)
			if (ALLOWED.has(rel)) continue
			const text = readFileSync(file, 'utf8')
			for (const match of text.matchAll(/import\s+(?!type\b)\{([^}]*)\}\s+from\s+'ai'/gu)) {
				const valueImports = match[1]
					.split(',')
					.map(s => s.trim())
					.filter(s => s && !s.startsWith('type '))
				if (valueImports.some(name => CALL_FNS.test(name))) offenders.push(rel)
			}
		}
		expect(offenders).toEqual([])
	})
})
