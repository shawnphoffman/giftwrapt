/**
 * Per-page capture helpers. Owns the "make this page screenshot-ready"
 * step: dismisses transient UI, disables animations, and waits for the
 * route's expected selector before returning the PNG bytes.
 */

import type { Page } from 'playwright'

import type { FixtureIds, RouteDef } from '../types'

const ANIM_OFF_CSS = `
	*, *::before, *::after {
		animation-duration: 0s !important;
		animation-delay: 0s !important;
		transition-duration: 0s !important;
		transition-delay: 0s !important;
		caret-color: transparent !important;
	}
	[data-sonner-toaster], [data-tanstack-devtools] { display: none !important; }
`

export function resolveRoutePath(route: RouteDef, ids: FixtureIds): string {
	return typeof route.path === 'function' ? route.path(ids) : route.path
}

export async function captureRoute(page: Page, route: RouteDef, url: string, outPath: string): Promise<void> {
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })

	// Wait for either the route's marker selector or a sensible fallback.
	const waitFor = route.waitFor ?? 'main, [role="main"], body'
	await page.locator(waitFor).first().waitFor({ state: 'visible', timeout: 15_000 })

	// Extra: wait for loading skeletons to disappear, if any.
	await page
		.waitForFunction(() => !document.querySelector('[data-slot="skeleton"]'), { timeout: 10_000 })
		.catch(() => {
			// Ignore timeout – better a slightly-loading screenshot than failing the whole run.
		})

	// Inject animation-killer + toast-hider AFTER the page has hydrated, so
	// any first-render motion is already settled.
	await page.addStyleTag({ content: ANIM_OFF_CSS })

	if (route.prep) {
		await route.prep(page)
	}

	// Settle: scroll to top, wait for fonts, give images a moment.
	await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }))
	await page.evaluate(() => document.fonts.ready).catch(() => undefined)
	await page.waitForTimeout(250)

	await page.screenshot({ path: outPath, fullPage: true, animations: 'disabled' })
}
