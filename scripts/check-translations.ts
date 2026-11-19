// Checks every translated catalog against the English one (plan 36).
//
//   pnpm i18n:check            all languages, all areas
//   pnpm i18n:check fr items   one language, areas whose file name contains "items"
//
// Errors fail the run: a missing or extra key, a placeholder or tag the
// English does not have, a plural without a catch-all, and the typography
// rules in TRANSLATION.md. Warnings are printed for a person to look at and do
// not fail it: a placeholder left out, a translation identical to the
// English, or one much longer.
//
// The Paraglide compiler already rejects invalid message syntax; this covers
// what it cannot know, which is whether two languages say the same thing in
// the same shape.

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

type Variant = { declarations?: Array<string>; selectors?: Array<string>; match?: Record<string, string> }
type Value = string | Array<Variant>
type Catalog = Record<string, Value>

const ROOT = join(import.meta.dirname, '..', 'messages')
const SOURCE = 'en'

const [onlyLocale, onlyArea] = process.argv.slice(2)

function load(locale: string, file: string): Catalog {
	const raw = JSON.parse(readFileSync(join(ROOT, locale, file), 'utf8')) as Catalog
	delete raw.$schema
	return raw
}

// Every string a message can render, keyed by its plural branch ('' when it
// is a plain string).
function branches(value: Value): Map<string, string> {
	const out = new Map<string, string>()
	if (typeof value === 'string') return out.set('', value)
	for (const variant of value) for (const [branch, text] of Object.entries(variant.match ?? {})) out.set(branch, text)
	return out
}

// `{name}` placeholders and `{#tag}`, `{/tag}`, `{#tag/}` markup across every
// branch: a translation may use a placeholder in one plural branch and not
// another, as English does.
function allTokens(value: Value): string {
	const set = new Set<string>()
	for (const text of branches(value).values()) for (const token of text.match(/\{[^{}]*\}/g) ?? []) set.add(token)
	return [...set].sort().join(' ')
}

const withoutTokens = (text: string) => text.replace(/\{[^{}]*\}/g, '')

// Typography each language must follow. See TRANSLATION.md.
const TYPOGRAPHY: Record<string, Array<{ test: RegExp; say: string }>> = {
	fr: [
		{ test: /'/, say: 'straight apostrophe (use ’)' },
		{ test: /[^\s\u00a0\u202f(«][;!?]/, say: 'no space before ; ! ? (use a narrow no-break space, U+202F)' },
		{ test: / [;!?]/, say: 'ordinary space before ; ! ? (use a narrow no-break space, U+202F)' },
		{ test: /[^\s\u00a0\u202f:/\d]:(\s|$)/, say: 'no space before : (use a no-break space, U+00A0)' },
		{ test: / :(\s|$)/, say: 'ordinary space before : (use a no-break space, U+00A0)' },
		{ test: /«[^\u00a0]|[^\u00a0]»/, say: 'guillemets need a no-break space inside (U+00A0)' },
		{ test: /\.\.\./, say: 'three dots (use …)' },
	],
}

// Exceptions to the typography rules: text that is not prose.
function isProse(text: string): boolean {
	return !/^https?:\/\//.test(text)
}

let errors = 0
let warnings = 0
const fail = (where: string, what: string) => {
	errors += 1
	console.log(`error  ${where}: ${what}`)
}
const warn = (where: string, what: string) => {
	warnings += 1
	console.log(`warn   ${where}: ${what}`)
}

const locales = readdirSync(ROOT, { withFileTypes: true })
	.filter(entry => entry.isDirectory() && entry.name !== SOURCE)
	.map(entry => entry.name)
	.filter(locale => !onlyLocale || locale === onlyLocale)

const files = readdirSync(join(ROOT, SOURCE))
	.filter(name => name.endsWith('.json'))
	.filter(name => !onlyArea || name.includes(onlyArea))

let checked = 0
for (const locale of locales) {
	for (const file of files) {
		const source = load(SOURCE, file)
		let target: Catalog
		try {
			target = load(locale, file)
		} catch {
			fail(`${locale}/${file}`, 'file is missing or is not valid JSON')
			continue
		}

		const sourceKeys = Object.keys(source)
		const targetKeys = Object.keys(target)
		for (const key of sourceKeys) if (!(key in target)) fail(`${locale}/${file} ${key}`, 'missing')
		for (const key of targetKeys) if (!(key in source)) fail(`${locale}/${file} ${key}`, `not in ${SOURCE}`)
		if (errors === 0 && sourceKeys.join() !== targetKeys.join()) warn(`${locale}/${file}`, `keys are in a different order than ${SOURCE}`)

		for (const key of sourceKeys) {
			if (!(key in target)) continue
			checked += 1
			const where = `${locale}/${file} ${key}`
			const from = source[key]
			const to = target[key]

			if (typeof from !== typeof to) {
				fail(where, 'one side is a plural message and the other is plain text')
				continue
			}
			// A placeholder the source does not have can never be filled. One the
			// translation leaves out is allowed (French sometimes rewords around
			// a name or a tag) but is worth a look.
			const have = new Set(allTokens(to).split(' ').filter(Boolean))
			const want = new Set(allTokens(from).split(' ').filter(Boolean))
			const extra = [...have].filter(token => !want.has(token))
			const dropped = [...want].filter(token => !have.has(token))
			if (extra.length > 0) fail(where, `placeholders or tags not in ${SOURCE}: ${extra.join(' ')}`)
			if (dropped.length > 0) warn(where, `does not use ${dropped.join(' ')}`)
			if (typeof to !== 'string') {
				for (const [index, variant] of to.entries()) {
					const sourceVariant = (from as Array<Variant>)[index] as Variant | undefined
					if (JSON.stringify(variant.declarations) !== JSON.stringify(sourceVariant?.declarations)) {
						fail(where, 'plural declarations differ from the source')
					}
					const names = Object.keys(variant.match ?? {})
					if (!names.some(name => name.split(',').every(part => part.trim().endsWith('=*')))) {
						fail(where, 'plural has no catch-all (*) branch')
					}
				}
			}

			const sourceTexts = branches(from)
			for (const [branch, text] of branches(to)) {
				const at = branch ? `${where} [${branch}]` : where
				if (text.trim() === '') fail(at, 'empty')
				if (text !== text.trim()) warn(at, 'leading or trailing space')
				const prose = withoutTokens(text)
				if (isProse(text)) for (const rule of TYPOGRAPHY[locale] ?? []) if (rule.test.test(prose)) fail(at, rule.say)

				const original = sourceTexts.get(branch) ?? [...sourceTexts.values()].at(0)
				if (original === undefined) continue
				const letters = withoutTokens(original).replace(/[^\p{L}]/gu, '')
				if (letters.length > 3 && text === original) warn(at, `same as ${SOURCE}: "${text.slice(0, 60)}"`)
				if (original.length >= 12 && text.length > original.length * 2) {
					warn(at, `more than twice as long as ${SOURCE} (${text.length} against ${original.length} characters)`)
				}
			}
		}
	}
}

console.log(`\n${checked} messages checked in ${locales.join(', ') || 'no language'}: ${errors} errors, ${warnings} warnings`)
process.exit(errors > 0 ? 1 : 0)
