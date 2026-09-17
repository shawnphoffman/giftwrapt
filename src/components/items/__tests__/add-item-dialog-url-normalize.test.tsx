// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ScrapeUrlModule from '@/lib/use-scrape-url'
import type { ScrapeUiState } from '@/lib/use-scrape-url'

// Regression test for scheme-less pastes: `www.amazon.com/...` used to fail
// the http(s) gate silently, leaving the import button disabled and the
// blur handler a no-op. The dialog must coerce it to https://, scrape that,
// and write the coerced form back into the field so it saves as a link.

const startScrape = vi.fn()

vi.mock('@/lib/use-scrape-url', async importOriginal => {
	const actual = await importOriginal<typeof ScrapeUrlModule>()
	return {
		...actual,
		useScrapeUrl: () => ({ state: { phase: 'idle' } as ScrapeUiState, start: startScrape, cancel: vi.fn(), reset: vi.fn() }),
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

describe('AddItemDialog scheme-less URL handling', () => {
	afterEach(cleanup)

	beforeEach(() => {
		startScrape.mockReset()
		globalThis.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		} as unknown as typeof ResizeObserver
	})

	it('enables the import button for a scheme-less host path', () => {
		render(<AddItemDialog open onOpenChange={() => {}} />)
		const urlInput = screen.getByLabelText<HTMLInputElement>('URL')
		const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Import details from URL' })

		expect(button.disabled).toBe(true)
		fireEvent.change(urlInput, { target: { value: 'www.amazon.com/gp/product/B0B51JBD7S' } })
		expect(button.disabled).toBe(false)
	})

	it('coerces to https on blur, scrapes the coerced URL, and writes it back', () => {
		render(<AddItemDialog open onOpenChange={() => {}} />)
		const urlInput = screen.getByLabelText<HTMLInputElement>('URL')

		fireEvent.change(urlInput, { target: { value: 'www.amazon.com/gp/product/B0B51JBD7S' } })
		fireEvent.blur(urlInput)

		expect(startScrape).toHaveBeenCalledTimes(1)
		expect(startScrape).toHaveBeenCalledWith('https://www.amazon.com/gp/product/B0B51JBD7S')
		expect(urlInput.value).toBe('https://www.amazon.com/gp/product/B0B51JBD7S')
	})

	it('does not scrape or rewrite input that is not a URL', () => {
		render(<AddItemDialog open onOpenChange={() => {}} />)
		const urlInput = screen.getByLabelText<HTMLInputElement>('URL')

		fireEvent.change(urlInput, { target: { value: 'AirPods Pro' } })
		fireEvent.blur(urlInput)

		expect(startScrape).not.toHaveBeenCalled()
		expect(urlInput.value).toBe('AirPods Pro')
		expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Import details from URL' }).disabled).toBe(true)
	})
})
