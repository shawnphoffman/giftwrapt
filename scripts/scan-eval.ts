/**
 * Scan identification eval. Runs Photo to Item over a folder of tag
 * photos and compares each result with what the tag actually says.
 *
 * It calls the same `extractFromPhoto` the app uses, so the prompt, the
 * field cleaning, the admin toggle, and the usage ledger are all the real
 * ones. Each photo is one model call on the configured AI provider.
 *
 * Usage:
 *
 *   pnpm scan:eval --dir=/absolute/path/to/fixtures
 *   pnpm scan:eval --dir=... --only=2234.webp
 *
 * The folder holds the photos and an `expected.json`:
 *
 *   [{ "file": "tag.webp", "note": "optional", "code": "optional barcode",
 *      "expect": {
 *        "brand": ["Nike"],            // any of these, case-insensitive
 *        "styleNumber": ["IZ3801-491"],
 *        "size": ["L"],
 *        "color": ["Varsity Royal"],
 *        "price": "60.00",
 *        "soldAt": ["nike.com"],       // some store contains one of these
 *        "titleIncludes": ["Hoodie"],
 *        "titleExcludes": ["Tech Fleece"]  // a name that is NOT on the tag
 *      } }]
 *
 * Fixtures are real users' photos: keep them out of the repository.
 *
 * Exit code 1 when a hard check fails: a style number, size, or price
 * that is on the tag and came back wrong or missing, a title containing
 * an excluded name, or a link anywhere in the output. Brand, color,
 * store, and title-includes misses are reported but do not fail the run.
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

import { extractFromPhoto } from '@/lib/scrapers/photo-extract'
import { assertImageBytes } from '@/lib/storage/image-pipeline'

type Expect = {
	brand?: Array<string>
	styleNumber?: Array<string>
	size?: Array<string>
	color?: Array<string>
	price?: string
	soldAt?: Array<string>
	titleIncludes?: Array<string>
	titleExcludes?: Array<string>
}

type Fixture = { file: string; note?: string; code?: string; expect: Expect }

type Check = { field: string; hard: boolean; ok: boolean; expected: string; got: string }

const norm = (s: string | undefined): string => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

function containsAny(got: string | undefined, accepted: Array<string>): boolean {
	const g = norm(got)
	return g.length > 0 && accepted.some(a => g.includes(norm(a)))
}

function equalsAny(got: string | undefined, accepted: Array<string>): boolean {
	const g = norm(got)
	return g.length > 0 && accepted.some(a => g === norm(a))
}

async function main() {
	const { values } = parseArgs({ options: { dir: { type: 'string' }, only: { type: 'string' } } })
	if (!values.dir) {
		console.error('Usage: pnpm scan:eval --dir=/absolute/path/to/fixtures [--only=file]')
		process.exit(2)
	}
	const dir = values.dir
	const fixtures = (JSON.parse(await readFile(join(dir, 'expected.json'), 'utf8')) as Array<Fixture>).filter(
		f => !values.only || f.file === values.only
	)
	if (fixtures.length === 0) {
		console.error('No fixtures to run.')
		process.exit(2)
	}

	const totals = new Map<string, { ok: number; of: number }>()
	let hardFailures = 0

	for (const fixture of fixtures) {
		const bytes = await readFile(join(dir, fixture.file))
		const mediaType = assertImageBytes(bytes)
		let out: Awaited<ReturnType<typeof extractFromPhoto>>
		try {
			out = await extractFromPhoto({ bytes: new Uint8Array(bytes), mediaType, source: 'cli', scannedCode: fixture.code })
		} catch (err) {
			console.error(`\n${fixture.file}: the call failed: ${err instanceof Error ? err.message : String(err)}`)
			console.error('Check that an AI provider is configured and Photo to Item is on for this database.')
			process.exit(2)
		}
		const { identity, suggestedNotes, result } = out
		const e = fixture.expect
		const checks: Array<Check> = []
		const add = (field: string, hard: boolean, ok: boolean, expected: string, got: string | undefined) =>
			checks.push({ field, hard, ok, expected, got: got ?? '' })

		if (e.brand) add('brand', false, containsAny(identity.brand ?? identity.title, e.brand), e.brand.join(' | '), identity.brand)
		if (e.styleNumber)
			add('styleNumber', true, containsAny(identity.styleNumber, e.styleNumber), e.styleNumber.join(' | '), identity.styleNumber)
		if (e.size) add('size', true, equalsAny(identity.size, e.size), e.size.join(' | '), identity.size)
		if (e.color) add('color', false, containsAny(identity.color, e.color), e.color.join(' | '), identity.color)
		if (e.price) add('price', true, Number(identity.price) === Number(e.price), e.price, identity.price)
		if (e.soldAt) {
			add(
				'soldAt',
				false,
				containsAny((identity.soldAt ?? []).join(' '), e.soldAt),
				e.soldAt.join(' | '),
				(identity.soldAt ?? []).join(', ')
			)
		}
		for (const phrase of e.titleIncludes ?? []) add('titleIncludes', false, containsAny(identity.title, [phrase]), phrase, identity.title)
		for (const phrase of e.titleExcludes ?? [])
			add('titleExcludes', true, !containsAny(identity.title, [phrase]), `not "${phrase}"`, identity.title)
		const everything = JSON.stringify({ identity, suggestedNotes, result })
		add('no link', true, !/:\/\//.test(everything), 'no "://" anywhere', /:\/\//.test(everything) ? 'link found' : 'none')

		console.log(`\n${fixture.file}${fixture.note ? `  (${fixture.note})` : ''}  ${out.ms} ms`)
		console.log(`  title: ${identity.title ?? '(none)'}`)
		if (suggestedNotes) console.log(`  notes: ${suggestedNotes.replace(/\n/g, ' / ')}`)
		for (const c of checks) {
			const mark = c.ok ? 'ok  ' : c.hard ? 'FAIL' : 'miss'
			if (!c.ok) console.log(`  ${mark} ${c.field}: expected ${c.expected}, got ${c.got || '(nothing)'}`)
			const t = totals.get(c.field) ?? { ok: 0, of: 0 }
			t.of += 1
			if (c.ok) t.ok += 1
			totals.set(c.field, t)
			if (!c.ok && c.hard) hardFailures += 1
		}
	}

	console.log('\nSummary')
	for (const [field, t] of totals) console.log(`  ${field.padEnd(14)} ${t.ok} of ${t.of}`)
	console.log(hardFailures === 0 ? '\nNo hard failures.' : `\n${hardFailures} hard failure(s).`)
	process.exit(hardFailures === 0 ? 0 : 1)
}

void main()
