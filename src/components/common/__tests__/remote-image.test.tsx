// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { ItemImage } from '@/components/items/item-image'

import { RemoteImage } from '../remote-image'

afterEach(cleanup)

describe('RemoteImage', () => {
	it('renders the image with an https-upgraded src', () => {
		render(<RemoteImage src="http://cdn.example.com/a.jpg" alt="Thing" className="size-10" />)
		expect(screen.getByRole('img', { name: 'Thing' }).getAttribute('src')).toBe('https://cdn.example.com/a.jpg')
	})

	it('swaps in a placeholder tile with the same sizing when the image fails', () => {
		render(<RemoteImage src="https://cdn.example.com/gone.jpg" alt="Thing" className="size-10 rounded" />)
		fireEvent.error(screen.getByRole('img', { name: 'Thing' }))
		const tile = screen.getByRole('img', { name: 'Thing' })
		expect(tile.tagName).toBe('SPAN')
		expect(tile.className).toContain('size-10')
		expect(tile.className).toContain('rounded')
	})

	it('tries again when the src changes', () => {
		const { rerender } = render(<RemoteImage src="https://cdn.example.com/gone.jpg" alt="Thing" />)
		fireEvent.error(screen.getByRole('img', { name: 'Thing' }))
		rerender(<RemoteImage src="https://cdn.example.com/new.jpg" alt="Thing" />)
		expect(screen.getByRole('img', { name: 'Thing' }).tagName).toBe('IMG')
	})

	it('renders the custom fallback when given one', () => {
		render(<RemoteImage src="https://cdn.example.com/gone.jpg" alt="Thing" fallback={<span>nope</span>} />)
		fireEvent.error(screen.getByRole('img', { name: 'Thing' }))
		expect(screen.getByText('nope')).toBeTruthy()
	})
})

describe('ItemImage', () => {
	it('drops the zoom button and shows a placeholder when the image fails', () => {
		render(<ItemImage src="https://cdn.example.com/gone.jpg" alt="Boots" />)
		fireEvent.error(screen.getByRole('img', { name: 'Boots' }))
		expect(screen.queryByRole('button')).toBeNull()
		expect(screen.getByRole('img', { name: 'Boots' }).tagName).toBe('SPAN')
	})
})
