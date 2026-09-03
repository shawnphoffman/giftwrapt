// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ScrapeUrlModule from '@/lib/use-scrape-url'
import type { ScrapeUiState } from '@/lib/use-scrape-url'

// Regression test for the "cleared notes reappear" bug: the scrape prefill
// effect must key on scrape events only, never on the field values, so a
// user emptying a prefilled field doesn't re-trigger "fill if empty".

let scrapeState: ScrapeUiState
let setScrapeState: (s: ScrapeUiState) => void = () => {}

vi.mock('@/lib/use-scrape-url', async importOriginal => {
	const React = await import('react')
	const actual = await importOriginal<typeof ScrapeUrlModule>()
	return {
		...actual,
		useScrapeUrl: () => {
			const [state, set] = React.useState<ScrapeUiState>(scrapeState)
			setScrapeState = set
			return { state, start: vi.fn(), cancel: vi.fn(), reset: vi.fn() }
		},
	}
})
vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ navigate: vi.fn() }) }))
vi.mock('@tanstack/react-query', () => ({
	useQuery: () => ({ data: { public: [], private: [], giftIdeas: [], editable: [], children: [] } }),
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}))
vi.mock('@/api/items', () => ({ createItem: vi.fn() }))
vi.mock('@/api/lists', () => ({ getMyLists: vi.fn() }))
vi.mock('@/api/uploads', () => ({ uploadItemImage: vi.fn() }))
vi.mock('@/hooks/use-storage-status', () => ({ useStorageStatus: () => ({ configured: false }) }))
vi.mock('@/lib/storage/client-resize', () => ({ resizeImageForUpload: vi.fn() }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../image-picker', () => ({ ImagePicker: () => null }))
vi.mock('../scrape-progress-alert', () => ({ ScrapeProgressAlert: () => null }))

import { AddItemDialog } from '../add-item-dialog'

const idle: ScrapeUiState = { phase: 'idle' } as ScrapeUiState
const doneResult = {
	phase: 'done',
	result: { title: 'Scraped title', price: '19.99', imageUrls: [], purchaseVariants: ['Color', 'Size'] },
} as unknown as ScrapeUiState

describe('AddItemDialog scrape prefill', () => {
	afterEach(cleanup)

	beforeEach(() => {
		scrapeState = idle
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver
	})

	it('does not refill a field the user cleared after the scrape prefilled it', async () => {
		render(<AddItemDialog open onOpenChange={() => {}} />)
		act(() => setScrapeState(doneResult))

		const notes = screen.getByLabelText<HTMLTextAreaElement>('Notes')
		const title = screen.getByLabelText<HTMLInputElement>(/Title/)
		expect(notes.value).toBe('- Color: \n- Size: ')
		expect(title.value).toBe('Scraped title')

		fireEvent.change(notes, { target: { value: '' } })
		fireEvent.change(title, { target: { value: '' } })
		expect(notes.value).toBe('')
		expect(title.value).toBe('')

		// Typing into another field re-renders; the cleared fields must stay cleared.
		fireEvent.change(screen.getByLabelText(/Price/), { target: { value: '5' } })
		expect(notes.value).toBe('')
		expect(title.value).toBe('')
	})

	it('still upgrades an untouched field when a later scrape event refines it', () => {
		render(<AddItemDialog open onOpenChange={() => {}} />)
		act(() => setScrapeState(doneResult))
		const title = screen.getByLabelText<HTMLInputElement>(/Title/)
		expect(title.value).toBe('Scraped title')

		act(() => setScrapeState({ ...doneResult, result: { ...(doneResult as any).result, title: 'Cleaned title' } } as any))
		expect(title.value).toBe('Cleaned title')
	})
})
