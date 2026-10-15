/**
 * Layout check for the text size setting (plan 30a).
 *
 * Loads every screenshot route at several widths and, on the same page load,
 * at each root font size the slider will offer (set the way the slider will,
 * via `document.documentElement.style.fontSize`). At each step it records:
 *
 *   - horizontal page overflow;
 *   - clipped text in fixed-size elements (truncate, line-clamp and
 *     scrolling elements excluded);
 *   - overlapping controls;
 *   - Buttons whose height, padding or weight differ from their `data-size`.
 *
 * Output, under `screenshots/layout-check/<runId>/` (mirrored to `latest/`):
 *   report.json   every finding per route, width and size
 *   diff.json     findings new at a size compared with 100% at the same width
 *   summary.md    the 100% baseline and the diff, grouped by component
 *   grids/        one image per route: a row per width, a column per size
 *   shots/        the full-page captures behind the grids, offenders outlined
 *
 *   pnpm layout:check                                   # everything
 *   pnpm layout:check --routes=my-lists,all-lists --widths=375
 *   pnpm layout:check --diff                            # re-print the latest diff; exit 1 if any
 *   pnpm layout:check --diff --report=path/to/report.json
 *
 * Prerequisites: `pnpm dev:screenshots` running in another shell (it seeds
 * the screenshot DB and writes the fixture IDs this reads).
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { relative, resolve as resolvePath } from 'node:path'
import { parseArgs } from 'node:util'

import { config as loadDotenv } from 'dotenv'
import { type Browser, chromium, type Page } from 'playwright'

import { composeGrid } from './layout-check/grid'
import { intendedReason } from './layout-check/intended'
import { BUTTON_SIZES, BUTTON_WEIGHT, type Finding, measurePage } from './layout-check/measure'
import { loginAndSaveState } from './screenshots/lib/auth'
import { prepareRoute, resolveRoutePath } from './screenshots/lib/capture'
import { waitForServer } from './screenshots/lib/dev-server'
import { mirrorToLatest, pruneOldRuns, timestampSlug } from './screenshots/lib/output'
import { applyTheme } from './screenshots/lib/theme'
import { ROUTES } from './screenshots/routes'
import type { FixtureIds, RouteDef } from './screenshots/types'

const REPO_ROOT = resolvePath(new URL('..', import.meta.url).pathname)
const FIXTURE_IDS_PATH = resolvePath(REPO_ROOT, 'scripts/screenshots/.fixture-ids.json')
const STORAGE_STATE_PATH = resolvePath(REPO_ROOT, '.cache/screenshots/layout-check-storageState.json')
const OUT_ROOT = resolvePath(REPO_ROOT, 'screenshots/layout-check')

/** Plan 30 widths and slider steps. 100 is the baseline diff mode compares against. */
const DEFAULT_WIDTHS = [320, 375, 768, 1280]
const DEFAULT_SIZES = [90, 95, 100, 112.5, 125]
const BASELINE_SIZE = 100

const VIEWPORT_HEIGHT: Record<number, number> = { 320: 568, 375: 812, 768: 1024, 1280: 800 }

const FLAG_CSS = `[data-layout-check] { outline: 2px solid #ef4444 !important; outline-offset: -1px !important; }`

interface CellResult {
	slug: string
	label: string
	path: string
	width: number
	size: number
	ok: boolean
	error?: string
	rootPx?: number
	scope?: 'page' | 'dialog'
	scrollWidth?: number
	/** Relative to the run folder. */
	shot?: string
	findings: Array<Finding>
}

interface Report {
	startedAt: string
	finishedAt: string
	url: string
	fixturesGeneratedAt: string
	widths: Array<number>
	sizes: Array<number>
	routes: Array<string>
	results: Array<CellResult>
}

interface DiffEntry {
	slug: string
	width: number
	size: number
	newFindings: Array<Finding>
}

function loadEnvFiles(): void {
	loadDotenv({ path: resolvePath(REPO_ROOT, '.env.local.screenshots'), quiet: true })
	loadDotenv({ path: resolvePath(REPO_ROOT, '.env.local'), quiet: true })
}

function defaultServerBaseUrl(): string {
	const raw = (process.env.BETTER_AUTH_URL ?? '').trim()
	try {
		return raw ? new URL(raw).origin : 'http://localhost:3003'
	} catch {
		return 'http://localhost:3003'
	}
}

function parseCliFlags() {
	const { values } = parseArgs({
		options: {
			url: { type: 'string' },
			routes: { type: 'string' },
			widths: { type: 'string' },
			sizes: { type: 'string' },
			diff: { type: 'boolean', default: false },
			report: { type: 'string' },
		},
		strict: true,
		allowPositionals: false,
	})
	const list = (s?: string) =>
		s
			? s
					.split(',')
					.map(x => x.trim())
					.filter(Boolean)
			: undefined
	const numbers = (s?: string) => list(s)?.map(Number)
	return {
		url: values.url,
		routes: list(values.routes),
		widths: numbers(values.widths),
		sizes: numbers(values.sizes),
		diffOnly: values.diff === true,
		report: values.report,
	}
}

async function loadFixtureIds(): Promise<FixtureIds> {
	try {
		return JSON.parse(await readFile(FIXTURE_IDS_PATH, 'utf8')) as FixtureIds
	} catch {
		throw new Error(
			`Fixture IDs not found at ${FIXTURE_IDS_PATH}.\nRun \`pnpm dev:screenshots\` first; it seeds the DB and writes the file.`
		)
	}
}

/** Hero routes are fixed-size docs captures, not app layouts. */
function checkableRoutes(): Array<RouteDef> {
	return ROUTES.filter(r => !(r.viewports && r.viewports.every(v => v === 'hero')))
}

function sizeLabel(size: number): string {
	return `${size}%`
}

/** React attaches fiber keys to DOM nodes as it hydrates; a prep click before that is dropped. */
async function waitForHydration(page: Page): Promise<void> {
	await page.waitForFunction(
		() => {
			const el = document.querySelector('main, form') ?? document.body.firstElementChild
			return el != null && Object.keys(el).some(k => k.startsWith('__reactFiber'))
		},
		undefined,
		{ timeout: 15_000 }
	)
}

/**
 * The dev server serves styles.css as a module; while it recompiles (another
 * session editing src/), utilities briefly stop applying and every Button
 * reads as a variant mismatch. Measure only once a sample of them applies.
 */
async function waitForStyles(page: Page): Promise<void> {
	await page.waitForFunction(
		() => {
			const flex = document.querySelector('.flex:not([class*="hidden"])')
			const button = document.querySelector('[class~="group/button"]')
			return (!flex || getComputedStyle(flex).display === 'flex') && (!button || getComputedStyle(button).fontWeight === '600')
		},
		undefined,
		{ timeout: 15_000 }
	)
}

/**
 * Resolve once the DOM has gone `quietMs` without a change. The skeleton
 * wait in prepareRoute does not cover data that streams in after the first
 * render (a cold dev server took seconds), and measuring a half-loaded page
 * at 100% makes everything that loads later read as new at a larger size.
 */
async function waitForQuietDom(page: Page, quietMs: number, timeoutMs = 15_000): Promise<void> {
	await page.evaluate(
		({ quiet, cap }) =>
			new Promise<void>(resolve => {
				let timer = setTimeout(done, quiet)
				const capTimer = setTimeout(done, cap)
				const observer = new MutationObserver(() => {
					clearTimeout(timer)
					timer = setTimeout(done, quiet)
				})
				observer.observe(document.body, { childList: true, subtree: true, characterData: true })
				function done() {
					observer.disconnect()
					clearTimeout(timer)
					clearTimeout(capTimer)
					resolve()
				}
			}),
		{ quiet: quietMs, cap: timeoutMs }
	)
}

/**
 * Resolve once the client has the signed-in user's session. SSR renders the
 * session as pending, so the admin nav, "You", and "Edit claim" appear only
 * after better-auth's `useSession` fetch returns, which can be seconds on a
 * busy dev server with no DOM change in between to hold the quiet-DOM wait.
 * Measuring before it lands made a page shorter in one run than the next.
 * Start this before navigating so the response cannot be missed.
 */
function waitForSession(page: Page): Promise<void> {
	return page
		.waitForResponse(res => new URL(res.url()).pathname === '/api/auth/get-session' && res.ok(), { timeout: 30_000 })
		.then(() => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)))))
		.then(() => undefined)
}

async function checkWidth(
	browser: Browser,
	baseUrl: string,
	ids: FixtureIds,
	routes: Array<RouteDef>,
	width: number,
	sizes: Array<number>,
	runDir: string
): Promise<Array<CellResult>> {
	const results: Array<CellResult> = []
	const height = VIEWPORT_HEIGHT[width] ?? 900
	const isMobile = width < 768

	for (const useAuth of [true, false]) {
		const group = routes.filter(r => (r.auth !== false) === useAuth)
		if (group.length === 0) continue

		const context = await browser.newContext({
			viewport: { width, height },
			deviceScaleFactor: 1,
			isMobile,
			hasTouch: isMobile,
			colorScheme: 'light',
			reducedMotion: 'reduce',
			storageState: useAuth ? STORAGE_STATE_PATH : undefined,
		})
		// tsx keeps function names with an `__name` helper that does not
		// exist in the page, which breaks functions passed to evaluate.
		await context.addInitScript({ content: 'globalThis.__name = globalThis.__name || (f => f)' })
		// Light is the primary theme; without this the seeded admin's saved
		// preference decides.
		await applyTheme(context, 'light')

		try {
			for (const route of group) {
				const path = resolveRoutePath(route, ids)
				const url = new URL(path, baseUrl).toString()
				const base = { slug: route.slug, label: route.label, path, width }
				// A fresh page per route: `/me#new` to `/me#add-item` is a
				// same-document hash change and would keep the first dialog.
				const prep = route.prep
				const hydratedRoute: RouteDef = prep
					? {
							...route,
							prep: async p => {
								await waitForHydration(p)
								await prep(p)
							},
						}
					: route
				// The dev server is slow under four parallel contexts; one retry
				// on a fresh page covers a prep step that timed out.
				let page: Page | null = null
				let prepError: string | null = null
				for (let attempt = 0; attempt < 2; attempt++) {
					page = await context.newPage()
					try {
						const session = useAuth ? waitForSession(page) : null
						// Awaited below; this only keeps a prep failure from also
						// surfacing as an unhandled rejection.
						session?.catch(() => undefined)
						await prepareRoute(page, hydratedRoute, url)
						if (session) await session
						await page.addStyleTag({ content: FLAG_CSS })
						await waitForQuietDom(page, 1000)
						prepError = null
						break
					} catch (err) {
						prepError = err instanceof Error ? err.message.split('\n')[0] : String(err)
						await page.close()
						page = null
					}
				}
				if (!page) {
					for (const size of sizes) results.push({ ...base, size, ok: false, error: prepError ?? 'unknown', findings: [] })
					console.log(`  ✗ [${width}] ${route.slug}: ${prepError}`)
					continue
				}

				const counts: Array<string> = []
				for (const size of sizes) {
					try {
						await page.evaluate(pct => {
							document.documentElement.style.fontSize = `${pct}%`
						}, size)
						// Two frames for layout, then a beat for ResizeObservers
						// and any state they set.
						await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))))
						await page.waitForTimeout(150)
						await waitForStyles(page)
						await waitForQuietDom(page, 250)

						const m = await page.evaluate(measurePage, { buttonSizes: BUTTON_SIZES, buttonWeight: BUTTON_WEIGHT })
						const shotPath = resolvePath(runDir, 'shots', route.slug, `${width}-${size}.jpg`)
						await mkdir(resolvePath(shotPath, '..'), { recursive: true })
						await page.screenshot({ path: shotPath, fullPage: true, type: 'jpeg', quality: 70, animations: 'disabled' })

						results.push({
							...base,
							size,
							ok: true,
							rootPx: m.rootPx,
							scope: m.scope,
							scrollWidth: m.scrollWidth,
							shot: relative(runDir, shotPath),
							findings: m.findings.map(f => {
								const intended = intendedReason(f)
								return intended ? { ...f, intended } : f
							}),
						})
						counts.push(`${sizeLabel(size)}:${m.findings.length}`)
					} catch (err) {
						const error = err instanceof Error ? err.message.split('\n')[0] : String(err)
						results.push({ ...base, size, ok: false, error, findings: [] })
						counts.push(`${sizeLabel(size)}:ERR`)
					}
				}
				console.log(`  ✓ [${width}] ${route.slug}  ${counts.join('  ')}`)
				await page.close()
			}
		} finally {
			await context.close()
		}
	}
	return results
}

function computeDiff(report: Report): Array<DiffEntry> {
	const diff: Array<DiffEntry> = []
	for (const r of report.results) {
		if (r.size === BASELINE_SIZE || !r.ok) continue
		const baseline = report.results.find(b => b.slug === r.slug && b.width === r.width && b.size === BASELINE_SIZE)
		if (!baseline?.ok) continue
		const known = new Set(baseline.findings.map(f => f.key))
		const fresh = r.findings.filter(f => !f.intended && !known.has(f.key))
		if (fresh.length > 0) diff.push({ slug: r.slug, width: r.width, size: r.size, newFindings: fresh })
	}
	return diff
}

/** One line per finding signature: repeats of a component collapse into a count. */
function groupFindings(entries: Array<{ slug: string; width: number; finding: Finding }>) {
	const groups = new Map<string, { finding: Finding; count: number; routes: Set<string>; widths: Set<number> }>()
	for (const { slug, width, finding } of entries) {
		const g = groups.get(finding.signature) ?? { finding, count: 0, routes: new Set(), widths: new Set() }
		g.count++
		g.routes.add(slug)
		g.widths.add(width)
		groups.set(finding.signature, g)
	}
	return [...groups.values()].sort((a, b) => a.finding.kind.localeCompare(b.finding.kind) || b.count - a.count)
}

function describeGroup(g: ReturnType<typeof groupFindings>[number]): Array<string> {
	const f = g.finding
	const el = f.elements[0] as Finding['elements'][number] | undefined
	const lines = [
		`- **${f.kind}**: ${f.message} (${g.count}x; widths ${[...g.widths].sort((a, b) => a - b).join(', ')}; ${g.routes.size} route${g.routes.size === 1 ? '' : 's'}: ${[...g.routes].slice(0, 6).join(', ')}${g.routes.size > 6 ? ', ...' : ''})`,
	]
	for (const e of f.elements.slice(0, f.kind === 'overlap' ? 2 : 3)) {
		lines.push(`  - \`<${e.tag}${e.slot ? ` data-slot=${e.slot}` : ''}>\` "${e.text}"`)
	}
	if (f.kind === 'button-variant') {
		const overrides = (f.detail.overrides as Array<string>).join(' ')
		if (overrides) lines.push(`  - overrides: \`${overrides}\``)
	} else if (el && f.kind !== 'page-overflow') {
		lines.push(`  - class: \`${el.className}\``)
	}
	return lines
}

function renderSummary(report: Report, diff: Array<DiffEntry>): string {
	const out: Array<string> = []
	out.push('# Layout check', '')
	out.push(`Run ${report.startedAt} against ${report.url} (fixtures ${report.fixturesGeneratedAt}).`)
	out.push(`Widths ${report.widths.join(', ')}; sizes ${report.sizes.map(sizeLabel).join(', ')}; ${report.routes.length} routes.`, '')

	const failed = report.results.filter(r => !r.ok)
	if (failed.length > 0) {
		out.push('## Failed cells', '')
		for (const r of failed) out.push(`- ${r.slug} @ ${r.width}px ${sizeLabel(r.size)}: ${r.error}`)
		out.push('')
	}

	out.push(`## Baseline (${BASELINE_SIZE}%)`, '')
	const baseline = report.results.filter(r => r.size === BASELINE_SIZE && r.ok)
	const baseEntries = baseline.flatMap(r => r.findings.map(finding => ({ slug: r.slug, width: r.width, finding })))
	const open = baseEntries.filter(e => !e.finding.intended)
	const intended = baseEntries.filter(e => e.finding.intended)
	out.push(`${open.length} open findings on ${new Set(open.map(e => e.slug)).size} routes; ${intended.length} recorded as intended.`, '')
	for (const g of groupFindings(open)) out.push(...describeGroup(g))
	out.push('')
	if (intended.length > 0) {
		out.push('### Recorded as intended', '')
		for (const g of groupFindings(intended)) out.push(...describeGroup(g), `  - why: ${g.finding.intended}`)
		out.push('')
	}

	out.push(`## New compared with ${BASELINE_SIZE}% at the same width`, '')
	for (const size of report.sizes.filter(s => s !== BASELINE_SIZE)) {
		const at = diff.filter(d => d.size === size)
		const n = at.reduce((sum, d) => sum + d.newFindings.length, 0)
		out.push(`### ${sizeLabel(size)}: ${n} new`, '')
		const entries = at.flatMap(d => d.newFindings.map(finding => ({ slug: d.slug, width: d.width, finding })))
		for (const g of groupFindings(entries)) out.push(...describeGroup(g))
		out.push('')
	}
	return out.join('\n')
}

function printDiff(report: Report, diff: Array<DiffEntry>): number {
	let total = 0
	console.log(`\nNew findings compared with ${BASELINE_SIZE}% at the same width:`)
	for (const size of report.sizes.filter(s => s !== BASELINE_SIZE)) {
		const at = diff.filter(d => d.size === size)
		const n = at.reduce((sum, d) => sum + d.newFindings.length, 0)
		total += n
		console.log(`  ${sizeLabel(size).padStart(6)}: ${n} new`)
		for (const d of at) {
			for (const f of d.newFindings) console.log(`          [${d.width}] ${d.slug}: ${f.kind}: ${f.message} "${f.elements[0]?.text ?? ''}"`)
		}
	}
	return total
}

async function runDiffOnly(reportPath: string): Promise<void> {
	const report = JSON.parse(await readFile(reportPath, 'utf8')) as Report
	const total = printDiff(report, computeDiff(report))
	process.exit(total > 0 ? 1 : 0)
}

async function main() {
	loadEnvFiles()
	const flags = parseCliFlags()

	if (flags.diffOnly) {
		await runDiffOnly(flags.report ? resolvePath(flags.report) : resolvePath(OUT_ROOT, 'latest/report.json'))
		return
	}

	const ids = await loadFixtureIds()
	const url = flags.url ?? defaultServerBaseUrl()
	const widths = flags.widths ?? DEFAULT_WIDTHS
	const sizes = flags.sizes ?? DEFAULT_SIZES
	if (!sizes.includes(BASELINE_SIZE)) sizes.push(BASELINE_SIZE)
	sizes.sort((a, b) => a - b)

	const all = checkableRoutes()
	const routes = flags.routes ? all.filter(r => flags.routes!.includes(r.slug)) : all
	if (routes.length === 0) throw new Error('No routes selected.')

	console.log(`🌐 Checking dev server at ${url}...`)
	await waitForServer(url)

	const runId = timestampSlug()
	const runDir = resolvePath(OUT_ROOT, runId)
	await mkdir(runDir, { recursive: true })
	console.log(`→ ${routes.length} routes × ${widths.length} widths × ${sizes.length} sizes\n`)

	const startedAt = new Date()
	const browser = await chromium.launch()
	let results: Array<CellResult>
	try {
		console.log('🔐 Signing in as admin@example.test...')
		await loginAndSaveState(browser, url, STORAGE_STATE_PATH)
		// One context per width, in parallel; routes run in order within each.
		const perWidth = await Promise.all(widths.map(w => checkWidth(browser, url, ids, routes, w, sizes, runDir)))
		results = perWidth.flat()
	} finally {
		await browser.close()
	}

	const report: Report = {
		startedAt: startedAt.toISOString(),
		finishedAt: new Date().toISOString(),
		url,
		fixturesGeneratedAt: ids.generatedAt,
		widths,
		sizes,
		routes: routes.map(r => r.slug),
		results,
	}
	const diff = computeDiff(report)

	await writeFile(resolvePath(runDir, 'report.json'), JSON.stringify(report, null, '\t'))
	await writeFile(resolvePath(runDir, 'diff.json'), JSON.stringify(diff, null, '\t'))
	await writeFile(resolvePath(runDir, 'summary.md'), renderSummary(report, diff))

	console.log('\n🧩 Composing grids...')
	await mkdir(resolvePath(runDir, 'grids'), { recursive: true })
	for (const route of routes) {
		const cells = results
			.filter(r => r.slug === route.slug)
			.map(r => ({
				width: r.width,
				size: r.size,
				file: r.shot ? resolvePath(runDir, r.shot) : null,
				findings: r.findings.length,
				newFindings: diff.find(d => d.slug === r.slug && d.width === r.width && d.size === r.size)?.newFindings.length ?? 0,
			}))
		await composeGrid(`${route.label} (${route.slug})`, widths, sizes, cells, resolvePath(runDir, 'grids', `${route.slug}.jpg`))
	}

	await mirrorToLatest(OUT_ROOT, runId)
	await pruneOldRuns(OUT_ROOT, 4)

	const baseline = results.filter(r => r.size === BASELINE_SIZE)
	const failed = results.filter(r => !r.ok)
	const baselineFindings = baseline.flatMap(r => r.findings)
	console.log(
		`\n${BASELINE_SIZE}% baseline: ${baselineFindings.filter(f => !f.intended).length} open findings, ${baselineFindings.filter(f => f.intended).length} recorded as intended`
	)
	printDiff(report, diff)
	console.log('')
	if (failed.length > 0) console.log(`⚠️  ${failed.length} cell(s) failed; see summary.md`)
	console.log(`✅ Report:  ${resolvePath(runDir, 'report.json')}`)
	console.log(`   Summary: ${resolvePath(runDir, 'summary.md')}`)
	console.log(`   Grids:   ${resolvePath(runDir, 'grids')}`)
	console.log(`   Latest:  ${resolvePath(OUT_ROOT, 'latest')}`)
}

main().catch(err => {
	console.error(err instanceof Error ? err.message : err)
	process.exit(1)
})
