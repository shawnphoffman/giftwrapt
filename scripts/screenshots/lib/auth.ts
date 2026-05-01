/**
 * Sign in once via the /sign-in form and persist the resulting Playwright
 * storageState so every subsequent context can be created already
 * authenticated.
 */

import { mkdir } from 'node:fs/promises'
import { dirname } from 'node:path'

import type { Browser } from 'playwright'

export const ADMIN_EMAIL = 'admin@example.test'
export const ADMIN_PASSWORD = 'SeedPass123!'

export async function loginAndSaveState(
	browser: Browser,
	baseUrl: string,
	storageStatePath: string,
	email = ADMIN_EMAIL,
	password = ADMIN_PASSWORD
): Promise<void> {
	const context = await browser.newContext()
	const page = await context.newPage()

	try {
		await page.goto(new URL('/sign-in', baseUrl).toString(), { waitUntil: 'domcontentloaded' })
		await page.locator('#email').fill(email)
		await page.locator('#password').fill(password)
		await Promise.all([
			page.waitForURL(url => !url.pathname.startsWith('/sign-in'), { timeout: 15_000 }),
			page.locator('button[type="submit"]').click(),
		])

		await mkdir(dirname(storageStatePath), { recursive: true })
		await context.storageState({ path: storageStatePath })
	} finally {
		await context.close()
	}
}
