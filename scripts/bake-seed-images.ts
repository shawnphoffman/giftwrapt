/**
 * One-shot rewriter: walks `scripts/seed-screenshots.ts`, finds every
 * `ph.square('label', 'hex')` / `ph.wide(...)` / `ph.tall(...)` call,
 * resolves the loremflickr URL it would produce to the final
 * `/cache/resized/...` static path, and replaces the call with a string
 * literal. The next seed insert will then use the resolved URL directly.
 *
 *   tsx scripts/bake-seed-images.ts
 *
 * Idempotent: rows already containing literal strings are left alone
 * (the regex only matches `ph.X(...)` calls).
 */

import { readFile, writeFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'

const SEED_PATH = resolvePath(new URL('.', import.meta.url).pathname, 'seed-screenshots.ts')
const CONCURRENCY = 16

type Variant = 'square' | 'wide' | 'tall'

const SIZES: Record<Variant, { w: number; h: number }> = {
	square: { w: 600, h: 600 },
	wide: { w: 800, h: 500 },
	tall: { w: 500, h: 800 },
}

function stableHash(s: string): number {
	let h = 2166136261
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619)
	return Math.abs(h | 0)
}

function buildLoremflickrUrl(label: string, variant: Variant): string {
	const { w, h } = SIZES[variant]
	const tags = encodeURIComponent(label.toLowerCase())
	return `https://loremflickr.com/${w}/${h}/${tags}?lock=${stableHash(label)}`
}

async function followRedirect(url: string): Promise<string> {
	const res = await fetch(url, { method: 'HEAD', redirect: 'follow' })
	return res.url
}

async function mapInBatches<T, TOut>(values: ReadonlyArray<T>, fn: (v: T) => Promise<TOut>, batchSize: number): Promise<Array<TOut>> {
	const out: Array<TOut> = []
	for (let i = 0; i < values.length; i += batchSize) {
		const batch = values.slice(i, i + batchSize)
		out.push(...(await Promise.all(batch.map(fn))))
	}
	return out
}

async function main() {
	const source = await readFile(SEED_PATH, 'utf8')

	// Match `ph.square('Label', 'hex')`. Hex arg is currently ignored by photo()
	// but kept in the call sites for legacy reasons.
	const phRe = /ph\.(square|wide|tall)\(\s*'([^']+)'\s*,\s*'[0-9a-fA-F]+'\s*\)/g
	const photoRe = /photo\(\s*'([^']+)'\s*,\s*(600|800|500)\s*,\s*(600|500|800)\s*\)/g

	type Hit = { match: string; variant: Variant; label: string; url: string }
	const hits: Array<Hit> = []
	for (const m of source.matchAll(phRe)) {
		const variant = m[1] as Variant
		const label = m[2]
		hits.push({ match: m[0], variant, label, url: buildLoremflickrUrl(label, variant) })
	}
	for (const m of source.matchAll(photoRe)) {
		const label = m[1]
		const w = Number(m[2])
		const h = Number(m[3])
		const variant: Variant = w === 800 ? 'wide' : w === 500 ? 'tall' : 'square'
		if (SIZES[variant].w !== w || SIZES[variant].h !== h) continue
		hits.push({ match: m[0], variant, label, url: buildLoremflickrUrl(label, variant) })
	}

	const uniqueUrls = Array.from(new Set(hits.map(h => h.url)))
	console.log(`Found ${hits.length} ph.X(...) call(s) (${uniqueUrls.length} unique URL(s)). Resolving...`)

	const resolved = new Map<string, string>()
	let failed = 0
	const results = await mapInBatches(
		uniqueUrls,
		async url => {
			try {
				const final = await followRedirect(url)
				return { url, final, ok: true as const }
			} catch (err) {
				return { url, final: url, ok: false as const, err: err instanceof Error ? err.message : String(err) }
			}
		},
		CONCURRENCY
	)
	for (const r of results) {
		if (r.ok && r.final !== r.url) {
			resolved.set(r.url, r.final)
		} else {
			failed++
			console.log(`  ✗ ${r.url}${'err' in r ? `: ${r.err}` : ' (no redirect)'}`)
		}
	}

	console.log(`\nResolved ${resolved.size}/${uniqueUrls.length} (${failed} failed). Rewriting source...`)

	let rewrites = 0
	let next = source.replace(phRe, (whole, _variant: string, label: string) => {
		const variant = _variant as Variant
		const url = buildLoremflickrUrl(label, variant)
		const final = resolved.get(url)
		if (!final) return whole
		rewrites++
		return `'${final}'`
	})
	next = next.replace(photoRe, (whole, label: string, w: string, h: string) => {
		const wn = Number(w)
		const variant: Variant = wn === 800 ? 'wide' : wn === 500 ? 'tall' : 'square'
		if (SIZES[variant].w !== wn || SIZES[variant].h !== Number(h)) return whole
		const url = buildLoremflickrUrl(label, variant)
		const final = resolved.get(url)
		if (!final) return whole
		rewrites++
		return `'${final}'`
	})

	if (next === source) {
		console.log('No changes to write.')
		return
	}

	await writeFile(SEED_PATH, next)
	console.log(`✅ Rewrote ${rewrites} call site(s) in ${SEED_PATH}.`)
}

main()
	.then(() => process.exit(0))
	.catch(err => {
		console.error(err)
		process.exit(1)
	})
