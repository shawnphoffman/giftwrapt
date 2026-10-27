// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { makeItem } from '../_stories/fixtures'
import { ItemFormDialog } from '../item-form-dialog'

vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }))
vi.mock('@/api/items', () => ({ createItem: vi.fn() }))
vi.mock('@/api/scraper', () => ({ getCachedScrapeImages: vi.fn().mockResolvedValue({ kind: 'ok', imageUrls: [] }) }))
vi.mock('@/api/uploads', () => ({ removeItemImage: vi.fn(), uploadItemImage: vi.fn() }))
vi.mock('@/hooks/use-storage-status', () => ({ useStorageStatus: () => ({ configured: false }) }))
vi.mock('@/lib/mutations/update-item', () => ({ useUpdateItem: () => ({ mutateAsync: vi.fn() }) }))
vi.mock('@/lib/use-scrape-url', () => ({
	useScrapeUrl: () => ({ state: { phase: 'idle' }, start: vi.fn(), cancel: vi.fn() }),
}))
vi.mock('../image-picker', () => ({ ImagePicker: () => null }))
vi.mock('../scrape-progress-alert', () => ({ ScrapeProgressAlert: () => null }))

describe('ItemFormDialog initial focus', () => {
	beforeEach(() => {
		vi.stubGlobal('matchMedia', () => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
	})

	afterEach(() => {
		cleanup()
		vi.unstubAllGlobals()
	})

	it('focuses the dialog on mobile without opening an input keyboard', async () => {
		render(<ItemFormDialog mode="edit" item={makeItem({ url: null })} open onOpenChange={() => {}} />)
		const dialog = await screen.findByRole('dialog')
		await waitFor(() => expect(document.activeElement).toBe(dialog))
		expect(dialog.style.getPropertyValue('--dialog-viewport-height')).toBe(`${window.innerHeight}px`)
		expect(screen.getByLabelText('Title').hasAttribute('autofocus')).toBe(false)
	})

	it('still focuses the title when editing on desktop', async () => {
		vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() }))
		render(<ItemFormDialog mode="edit" item={makeItem({ url: null })} open onOpenChange={() => {}} />)
		await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Title')))
		expect(screen.getByRole('dialog').style.getPropertyValue('--dialog-viewport-height')).toBe('')
	})
})
