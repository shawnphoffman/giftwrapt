// Dumps the Prometheus registry's metric metadata to a committed JSON
// file under observability/metrics-catalog.json. The docs site reads
// the same file via its prebuild sync, so the operator-facing docs page
// always reflects the current registry. Mirrors the pattern in
// scripts/precompute-holidays.ts and scripts/check-migrations.ts.
//
// Run: pnpm metrics:catalog
// CI check: pnpm metrics:catalog --check (fails on drift)

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { registry } from '../src/lib/observability/metrics'

const __dirname = dirname(fileURLToPath(import.meta.url))
const outPath = resolve(__dirname, '../observability/metrics-catalog.json')

type CatalogEntry = {
	name: string
	help: string
	type: string
	labels: ReadonlyArray<string>
}

const metrics = registry.getMetricsAsArray() as unknown as ReadonlyArray<{
	name: string
	help: string
	type: string
	labelNames: ReadonlyArray<string>
}>

const catalog: ReadonlyArray<CatalogEntry> = metrics
	.map(m => ({
		name: m.name,
		help: m.help,
		type: m.type,
		labels: [...m.labelNames].sort(),
	}))
	.sort((a, b) => a.name.localeCompare(b.name))

const serialized = `${JSON.stringify(catalog, null, 2)}\n`

const checkOnly = process.argv.includes('--check')
if (checkOnly) {
	let existing: string
	try {
		existing = readFileSync(outPath, 'utf8')
	} catch {
		console.error(`metrics catalog missing at ${outPath}. Run \`pnpm metrics:catalog\` and commit the result.`)
		process.exit(1)
	}
	if (existing !== serialized) {
		console.error(`metrics catalog at ${outPath} is stale. Run \`pnpm metrics:catalog\` and commit the result.`)
		process.exit(1)
	}
	console.log(`metrics catalog up to date (${catalog.length} entries).`)
} else {
	mkdirSync(dirname(outPath), { recursive: true })
	writeFileSync(outPath, serialized)
	console.log(`Wrote ${catalog.length} metric entries to ${outPath}`)
}
