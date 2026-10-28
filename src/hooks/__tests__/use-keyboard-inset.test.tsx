// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useKeyboardInset } from '../use-keyboard-inset'

function Harness({ open = true, mounted = true }: { open?: boolean; mounted?: boolean }) {
	const ref = useKeyboardInset(open)
	return mounted ? <div ref={ref} data-testid="dialog" /> : null
}

describe('useKeyboardInset', () => {
	let viewport: EventTarget & { height: number; offsetTop: number }
	let mobile: EventTarget & { matches: boolean }

	beforeEach(() => {
		viewport = Object.assign(new EventTarget(), { height: window.innerHeight, offsetTop: 0 })
		mobile = Object.assign(new EventTarget(), { matches: true })
		vi.stubGlobal('visualViewport', viewport)
		vi.stubGlobal('matchMedia', () => mobile)
	})

	afterEach(() => {
		cleanup()
		vi.unstubAllGlobals()
	})

	it('sets the keyboard inset once the portal mounts and follows keyboard resizes', () => {
		const { rerender } = render(<Harness mounted={false} />)
		rerender(<Harness />)
		const dialog = screen.getByTestId('dialog')
		expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('')

		act(() => {
			viewport.height = window.innerHeight - 300
			viewport.dispatchEvent(new Event('resize'))
		})
		expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('300px')

		act(() => {
			viewport.height = window.innerHeight
			viewport.dispatchEvent(new Event('resize'))
		})
		expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('')
	})

	it('never positions or sizes the dialog, so viewport panning cannot move it', () => {
		render(<Harness />)
		const dialog = screen.getByTestId('dialog')
		act(() => {
			viewport.height = window.innerHeight - 300
			viewport.offsetTop = 120
			viewport.dispatchEvent(new Event('resize'))
			viewport.dispatchEvent(new Event('scroll'))
		})
		expect(dialog.style.top).toBe('')
		expect(dialog.style.height).toBe('')
		expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('300px')
	})

	it('clears the inset on desktop and after closing', () => {
		viewport.height = window.innerHeight - 300
		const { rerender } = render(<Harness />)
		const dialog = screen.getByTestId('dialog')
		expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('300px')

		act(() => {
			mobile.matches = false
			mobile.dispatchEvent(new Event('change'))
		})
		expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('')

		act(() => {
			mobile.matches = true
			mobile.dispatchEvent(new Event('change'))
		})
		expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('300px')

		rerender(<Harness open={false} />)
		act(() => viewport.dispatchEvent(new Event('resize')))
		expect(dialog.style.getPropertyValue('--keyboard-inset')).toBe('')
	})

	it('does nothing without the Visual Viewport API', () => {
		vi.stubGlobal('visualViewport', undefined)
		render(<Harness />)
		expect(screen.getByTestId('dialog').style.getPropertyValue('--keyboard-inset')).toBe('')
	})
})
