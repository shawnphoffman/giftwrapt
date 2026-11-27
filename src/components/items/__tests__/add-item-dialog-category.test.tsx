// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The Add Item dialog picks its list in the form, so it loads that list's
// categories itself. The Category field shows only once the picked list has
// one, the same rule as the item form on a list's own edit view.

let categories: Array<{ id: number; name: string; sortOrder: number }> = []
const seenCategoryQueries: Array<{ listId: string; enabled: boolean }> = []

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ navigate: vi.fn() }) }))
vi.mock('@tanstack/react-query', () => ({
	useQuery: (options: { queryKey: ReadonlyArray<unknown>; enabled?: boolean }) => {
		if (options.queryKey[0] === 'list-categories') {
			seenCategoryQueries.push({ listId: String(options.queryKey[1]), enabled: options.enabled !== false })
			return { data: options.enabled === false ? undefined : { kind: 'ok', categories } }
		}
		return {
			data: {
				public: [{ id: 7, name: 'Wishlist', type: 'wishlist', isPrivate: false, isPrimary: true }],
				private: [],
				giftIdeas: [],
				editable: [],
				children: [],
			},
		}
	},
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/api/categories', () => ({ getListCategories: vi.fn() }))
vi.mock('@/api/items', () => ({ createItem: vi.fn() }))
vi.mock('@/api/lists', () => ({ getMyLists: vi.fn() }))
vi.mock('@/api/uploads', () => ({ uploadItemImage: vi.fn() }))
vi.mock('@/hooks/use-storage-status', () => ({ useStorageStatus: () => ({ configured: false }) }))
vi.mock('@/hooks/use-app-settings', () => ({ useAppSetting: () => 'USD' }))
vi.mock('@/lib/storage/client-resize', () => ({ resizeImageForUpload: vi.fn() }))
vi.mock('@/lib/use-scrape-url', () => ({
	useScrapeUrl: () => ({ state: { phase: 'idle' }, start: vi.fn(), cancel: vi.fn(), reset: vi.fn() }),
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../image-picker', () => ({ ImagePicker: () => null }))
vi.mock('../scrape-progress-alert', () => ({ ScrapeProgressAlert: () => null }))

import { AddItemDialog } from '../add-item-dialog'

describe('AddItemDialog category field', () => {
	afterEach(cleanup)

	beforeEach(() => {
		categories = []
		seenCategoryQueries.length = 0
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver
	})

	it('is not shown when the picked list has no categories', () => {
		render(<AddItemDialog open onOpenChange={() => {}} />)
		expect(screen.queryByRole('combobox', { name: 'Category' })).toBeNull()
	})

	it('is shown, on No category, once the picked list has one', () => {
		categories = [
			{ id: 1, name: 'Clothes', sortOrder: 0 },
			{ id: 2, name: 'Makeup', sortOrder: 1 },
		]
		render(<AddItemDialog open onOpenChange={() => {}} />)
		const field = screen.getByRole('combobox', { name: 'Category' })
		expect(field.textContent).toContain('No category')
		// The categories asked for are the picked list's.
		expect(seenCategoryQueries.at(-1)).toEqual({ listId: '7', enabled: true })
	})
})
