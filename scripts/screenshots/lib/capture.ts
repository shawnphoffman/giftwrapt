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

// Heuristic detector for the dev-server's 500 SSR error page. The
// TanStack Start dev runtime occasionally renders a stack-trace frame
// instead of the route on the first hit; reloading once almost always
// resolves it. We look at the HTTP response status as the primary
// signal and fall back to checking for the framework error overlay.
async function pageLooksLikeServerError(page: Page, status: number | null): Promise<boolean> {
	if (status != null && status >= 500) return true
	// Check for the Vite/TanStack error overlay or a bare error frame.
	const errOverlay = await page.locator('vite-error-overlay, [data-error-overlay], pre code:has-text("TypeError")').count()
	return errOverlay > 0
}

export async function captureRoute(page: Page, route: RouteDef, url: string, outPath: string): Promise<void> {
	let response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 })
	let status = response?.status() ?? null

	// Dev-server occasionally returns 500 on first hit (HMR re-optimize, stale
	// router entry). Reload up to twice before giving up.
	for (let attempt = 0; attempt < 2; attempt++) {
		if (!(await pageLooksLikeServerError(page, status))) break
		await page.waitForTimeout(500)
		response = await page.reload({ waitUntil: 'domcontentloaded', timeout: 30_000 })
		status = response?.status() ?? null
	}

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
