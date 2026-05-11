/**
 * Interactive screenshot generator.
 *
 * Walks a configurable set of routes in a Playwright Chromium browser as
 * the seeded `admin` user, captures full-page PNGs at multiple
 * (viewport × theme) combinations, and writes them to a timestamped
 * folder under `screenshots/` (with a `latest/` mirror).
 *
 *   pnpm screenshots                 # interactive
 *   pnpm screenshots --non-interactive --routes=home,me
 *
 * Prerequisites:
 *   - DB seeded: `SEED_SAFE=1 pnpm db:seed:screenshots`
 *   - Env: loads `.env.local.screenshots` then `.env.local` (screenshots wins on overlap).
 *     Default URL comes from `SERVER_URL` / `VITE_SERVER_URL` when `--url` is omitted.
 *   - Dev server for captures: `pnpm dev:screenshots` (loads `.env.local.screenshots`).
 *     Set `VITE_TANSTACK_DEVTOOLS=false` there so TanStack devtools stay off in the bundle.
 */

import { readFile } from 'node:fs/promises'
import { resolve as resolvePath } from 'node:path'
import { parseArgs } from 'node:util'

import { checkbox, confirm, input } from '@inquirer/prompts'
import { config as loadDotenv } from 'dotenv'
import { chromium } from 'playwright'

import { loginAndSaveState } from './screenshots/lib/auth'
import { captureRoute, resolveRoutePath } from './screenshots/lib/capture'
import { waitForServer } from './screenshots/lib/dev-server'
import {
	ensureDirFor,
	fileForRun,
	type ManifestEntry,
	mirrorToLatest,
	mirrorViewportThemeTo,
	pruneOldRuns,
	timestampSlug,
	writeManifest,
} from './screenshots/lib/output'
import { composeSplitsForRun } from './screenshots/lib/split'
import { applyTheme } from './screenshots/lib/theme'
import { ROUTES } from './screenshots/routes'
import { type FixtureIds, type Theme, type ViewportName, VIEWPORTS } from './screenshots/types'

const REPO_ROOT = resolvePath(new URL('..', import.meta.url).pathname)
const FIXTURE_IDS_PATH = resolvePath(REPO_ROOT, 'scripts/screenshots/.fixture-ids.json')

/** Screenshots env wins for overlapping keys; `.env.local` fills in the rest. */
function loadScreenshotEnvFiles(): void {
	loadDotenv({ path: resolvePath(REPO_ROOT, '.env.local.screenshots') })
	loadDotenv({ path: resolvePath(REPO_ROOT, '.env.local') })
}

function defaultServerBaseUrl(): string {
	const raw = (process.env.SERVER_URL ?? process.env.VITE_SERVER_URL ?? '').trim()
	if (!raw) return 'http://localhost:3000'
	try {
		const u = new URL(raw)
		const path = u.pathname === '/' ? '' : u.pathname.replace(/\/$/, '')
		const base = `${u.origin}${path}`
		return base || u.origin
	} catch {
		return 'http://localhost:3000'
	}
}
const STORAGE_STATE_PATH = resolvePath(REPO_ROOT, '.cache/screenshots/storageState.json')
const DEFAULT_OUT = resolvePath(REPO_ROOT, 'screenshots')
const DOCS_SCREENSHOTS_DIR = resolvePath(REPO_ROOT, '../docs/src/screenshots')

interface CliFlags {
	url?: string
	out?: string
	routes?: Array<string>
	viewports?: Array<ViewportName>
	themes?: Array<Theme>
	nonInteractive: boolean
	split: boolean
}

function parseCliFlags(): CliFlags {
	const { values } = parseArgs({
		options: {
			url: { type: 'string' },
			out: { type: 'string' },
			routes: { type: 'string' },
			viewports: { type: 'string' },
			themes: { type: 'string' },
			'non-interactive': { type: 'boolean', default: false },
			'no-split': { type: 'boolean', default: false },
		},
		strict: true,
		allowPositionals: false,
	})

	const split = (s?: string) =>
		s
			? s
					.split(',')
					.map(x => x.trim())
					.filter(Boolean)
			: undefined

	return {
		url: values.url,
		out: values.out,
		routes: split(values.routes),
		viewports: split(values.viewports) as Array<ViewportName> | undefined,
		themes: split(values.themes) as Array<Theme> | undefined,
		nonInteractive: values['non-interactive'] === true,
		split: values['no-split'] !== true,
	}
}

async function loadFixtureIds(): Promise<FixtureIds> {
	let raw: string
	try {
		raw = await readFile(FIXTURE_IDS_PATH, 'utf8')
	} catch {
		throw new Error(
			`Fixture IDs not found at ${FIXTURE_IDS_PATH}.\n` +
				`Run \`SEED_SAFE=1 pnpm db:seed:screenshots\` first to seed the DB and generate the fixture file.`
		)
	}
	return JSON.parse(raw) as FixtureIds
}

async function gatherChoices(flags: CliFlags) {
	const allRouteSlugs = ROUTES.map(r => r.slug)

	if (flags.nonInteractive) {
		return {
			url: flags.url ?? defaultServerBaseUrl(),
			outDir: flags.out ? resolvePath(flags.out) : DEFAULT_OUT,
			routeSlugs: flags.routes ?? allRouteSlugs,
			viewports: flags.viewports ?? (['mobile', 'wide', 'basic'] as Array<ViewportName>),
			themes: flags.themes ?? (['light', 'dark'] as Array<Theme>),
		}
	}

	let url: string
	if (flags.url) {
		url = flags.url
	} else {
		url = await input({
			message: 'Server base URL',
			default: defaultServerBaseUrl(),
		})
		url = url.trim()
		try {
			new URL(url)
		} catch {
			throw new Error(`Not a valid URL: ${url}`)
		}
	}

	const outDir = flags.out ? resolvePath(flags.out) : DEFAULT_OUT

	const viewports =
		flags.viewports ??
		(await checkbox<ViewportName>({
			message: 'Viewports',
			choices: [
				{ name: 'Mobile (390x844)', value: 'mobile', checked: false },
				{ name: 'Basic (1080x1000)', value: 'basic', checked: true },
				{ name: 'Wide (1920x1080)', value: 'wide', checked: false },
			],
			required: true,
		}))

	const themes =
		flags.themes ??
		(await checkbox<Theme>({
			message: 'Themes',
			choices: [
				{ name: 'Light', value: 'light', checked: true },
				{ name: 'Dark', value: 'dark', checked: true },
			],
			required: true,
		}))

	const routeSlugs =
		flags.routes ??
		(await checkbox<string>({
			message: 'Routes',
			pageSize: 20,
			choices: ROUTES.map(r => ({ name: `${r.label} (${r.slug})`, value: r.slug, checked: true })),
			required: true,
		}))

	return { url, outDir, routeSlugs, viewports, themes }
}

interface RunPlan {
	url: string
	outDir: string
	runId: string
	viewports: Array<ViewportName>
	themes: Array<Theme>
	routeSlugs: Array<string>
	split: boolean
}

async function run(plan: RunPlan, ids: FixtureIds) {
	const startedAt = new Date()
	const entries: Array<ManifestEntry> = []
	const failed: Array<{ slug: string; viewport: ViewportName; theme: Theme; error: string }> = []

	const selectedRoutes = ROUTES.filter(r => plan.routeSlugs.includes(r.slug))
	if (selectedRoutes.length === 0) throw new Error('No routes selected.')

	console.log(`\n→ ${selectedRoutes.length} route(s) × ${plan.viewports.length} viewport(s) × ${plan.themes.length} theme(s)\n`)

	const browser = await chromium.launch()
	try {
		console.log('🔐 Signing in as admin@example.test...')
		await loginAndSaveState(browser, plan.url, STORAGE_STATE_PATH)

		for (const viewportName of plan.viewports) {
			const viewport = VIEWPORTS[viewportName]
			for (const theme of plan.themes) {
				const filteredRoutes = selectedRoutes.filter(r => {
					if (r.viewports && !r.viewports.includes(viewportName)) return false
					if (r.themes && !r.themes.includes(theme)) return false
					return true
				})

				const authedRoutes = filteredRoutes.filter(r => r.auth !== false)
				const publicRoutes = filteredRoutes.filter(r => r.auth === false)

				for (const [routes, useAuth] of [[authedRoutes, true] as const, [publicRoutes, false] as const]) {
					if (routes.length === 0) continue

					const context = await browser.newContext({
						viewport: { width: viewport.width, height: viewport.height },
						deviceScaleFactor: viewport.deviceScaleFactor,
						isMobile: viewport.isMobile,
						hasTouch: viewport.hasTouch,
						colorScheme: theme,
						reducedMotion: 'reduce',
						storageState: useAuth ? STORAGE_STATE_PATH : undefined,
					})
					await applyTheme(context, theme)

					const page = await context.newPage()
					try {
						for (const route of routes) {
							const path = resolveRoutePath(route, ids)
							const url = new URL(path, plan.url).toString()
							const outPath = fileForRun(plan.outDir, plan.runId, viewportName, theme, route.slug)
							const t0 = Date.now()
							try {
								await ensureDirFor(outPath)
								await captureRoute(page, route, url, outPath)
								const { stat } = await import('node:fs/promises')
								const s = await stat(outPath)
								entries.push({
									slug: route.slug,
									label: route.label,
									path,
									viewport: viewportName,
									theme,
									file: outPath,
									bytes: s.size,
									durationMs: Date.now() - t0,
								})
								console.log(`  ✓ [${viewportName}/${theme}] ${route.slug} (${s.size} B, ${Date.now() - t0}ms)`)
							} catch (err) {
								const msg = err instanceof Error ? err.message : String(err)
								failed.push({ slug: route.slug, viewport: viewportName, theme, error: msg })
								console.log(`  ✗ [${viewportName}/${theme}] ${route.slug}: ${msg}`)
							}
						}
					} finally {
						await context.close()
					}
				}
			}
		}
	} finally {
		await browser.close()
	}

	let splitCreated = 0
	if (plan.split && plan.themes.includes('light') && plan.themes.includes('dark') && entries.length > 0) {
		console.log('\n🪞 Composing split images...')
		const result = await composeSplitsForRun(plan.outDir, plan.runId, entries)
		splitCreated = result.created.length
		for (const entry of result.created) {
			console.log(`  ✓ [${entry.viewport}/split] ${entry.slug} (${entry.bytes} B, ${entry.durationMs}ms)`)
		}
		for (const skip of result.skipped) {
			console.log(`  · [${skip.viewport}/split] ${skip.slug}: skipped (${skip.reason})`)
		}
	}

	const finishedAt = new Date()
	const manifestPath = await writeManifest(plan.outDir, plan.runId, {
		startedAt: startedAt.toISOString(),
		finishedAt: finishedAt.toISOString(),
		url: plan.url,
		totalDurationMs: finishedAt.getTime() - startedAt.getTime(),
		entries,
		failed,
	})

	await mirrorToLatest(plan.outDir, plan.runId)

	const isFullRouteRun = plan.routeSlugs.length === ROUTES.length
	if (plan.viewports.includes('basic') && isFullRouteRun) {
		for (const theme of plan.themes) {
			// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
			if (theme !== 'light' && theme !== 'dark') continue
			const copied = await mirrorViewportThemeTo(plan.outDir, plan.runId, 'basic', theme, DOCS_SCREENSHOTS_DIR)
			if (copied > 0) {
				console.log(`📚 Mirrored ${copied} basic/${theme} screenshot(s) to ${resolvePath(DOCS_SCREENSHOTS_DIR, 'basic', theme)}`)
			}
		}
	} else if (plan.viewports.includes('basic')) {
		console.log('📚 Skipping docs mirror (partial route run; docs sync only happens on full runs).')
	}

	// Retention: keep the current run plus the `KEEP_RUNS - 1` most recent
	// previous runs; delete everything older. `latest/` is unaffected
	// because it's a non-timestamp folder.
	const KEEP_RUNS = 4
	const pruned = await pruneOldRuns(plan.outDir, KEEP_RUNS)
	if (pruned.length > 0) {
		console.log(`🧹 Pruned ${pruned.length} old run folder(s): ${pruned.join(', ')}`)
	}

	console.log('')
	console.log(
		`✅ Captured ${entries.length} screenshots${failed.length ? `, ${failed.length} failed` : ''}${splitCreated ? `, ${splitCreated} split` : ''}.`
	)
	console.log(`   Run:    ${resolvePath(plan.outDir, plan.runId)}`)
	console.log(`   Latest: ${resolvePath(plan.outDir, 'latest')}`)
	console.log(`   Manifest: ${manifestPath}`)
}

async function main() {
	loadScreenshotEnvFiles()
	const flags = parseCliFlags()

	const ids = await loadFixtureIds()

	if (!flags.nonInteractive) {
		const ok = await confirm({
			message: `Use seed data generated at ${ids.generatedAt}?`,
			default: true,
		})
		if (!ok) {
			console.log('Aborted. Re-run `pnpm db:seed:screenshots` and try again.')
			process.exit(0)
		}
	}

	const choices = await gatherChoices(flags)

	console.log(`🌐 Checking dev server at ${choices.url}...`)
	await waitForServer(choices.url)

	const runId = timestampSlug()

	await run({ ...choices, runId, split: flags.split }, ids)
}

main().catch(err => {
	console.error(err instanceof Error ? err.message : err)
	process.exit(1)
})
