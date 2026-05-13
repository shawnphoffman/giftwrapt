import { withRollback } from '@test/integration/setup'
import { describe, expect, it } from 'vitest'

import { appSettings } from '@/db/schema'
import { getAppSettings } from '@/lib/settings-loader'

// Regression test for a reported (but not reproduced on main) UI symptom
// where toggling `enableChristmasLists` or `enableBirthdayLists` in the
// admin UI appeared to flip `enableMobileApp` off. Each setting is stored
// as its own row in `app_settings`, and the server-side update path upserts
// only the keys it received - so mutating one key must never clobber an
// unrelated one. If this assertion ever fires, look for a regression in
// the upsert loop in `src/api/settings.ts` or in the legacy-key migration
// branches inside `getAppSettings`.
describe('app_settings unrelated-key isolation', () => {
	it('mutating enableChristmasLists leaves enableMobileApp untouched', async () => {
		await withRollback(async tx => {
			// Seed: API & API Keys explicitly ON.
			await tx
				.insert(appSettings)
				.values({ key: 'enableMobileApp', value: true })
				.onConflictDoUpdate({ target: appSettings.key, set: { value: true } })

			const before = await getAppSettings(tx)
			expect(before.enableMobileApp).toBe(true)

			// Mutate an unrelated key, matching what the admin UI does:
			// a single upsert of just that key.
			await tx
				.insert(appSettings)
				.values({ key: 'enableChristmasLists', value: false })
				.onConflictDoUpdate({ target: appSettings.key, set: { value: false } })

			const after = await getAppSettings(tx)
			expect(after.enableChristmasLists).toBe(false)
			expect(after.enableMobileApp).toBe(true)
		})
	})

	it('mutating enableBirthdayLists leaves enableMobileApp untouched', async () => {
		await withRollback(async tx => {
			await tx
				.insert(appSettings)
				.values({ key: 'enableMobileApp', value: true })
				.onConflictDoUpdate({ target: appSettings.key, set: { value: true } })

			await tx
				.insert(appSettings)
				.values({ key: 'enableBirthdayLists', value: false })
				.onConflictDoUpdate({ target: appSettings.key, set: { value: false } })

			const after = await getAppSettings(tx)
			expect(after.enableBirthdayLists).toBe(false)
			expect(after.enableMobileApp).toBe(true)
		})
	})
})
