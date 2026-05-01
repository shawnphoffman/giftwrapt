/**
 * Force a deterministic theme on a Playwright BrowserContext before any
 * page navigates. Sets both `localStorage.theme` (which next-themes reads
 * on hydration) and adds the matching `<html>` class via addInitScript so
 * there is no light-mode FOUC during a dark-theme capture.
 */

import type { BrowserContext } from 'playwright'

import type { Theme } from '../types'

export async function applyTheme(context: BrowserContext, theme: Theme): Promise<void> {
	const initScript = `
		(() => {
			try {
				localStorage.setItem('theme', '${theme}')
			} catch {}
			const apply = () => {
				if (!document.documentElement) return
				document.documentElement.classList.remove('light', 'dark')
				document.documentElement.classList.add('${theme}')
				document.documentElement.style.colorScheme = '${theme}'
			}
			apply()
			document.addEventListener('DOMContentLoaded', apply, { once: true })
		})()
	`
	await context.addInitScript(initScript)
}
