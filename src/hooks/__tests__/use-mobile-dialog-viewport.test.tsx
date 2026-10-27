// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useMobileDialogViewport } from '../use-mobile-dialog-viewport'

function Harness({ open = true, mounted = true }: { open?: boolean; mounted?: boolean }) {
	const ref = useMobileDialogViewport(open)
	return mounted ? <div ref={ref} data-testid="dialog" /> : null
}

describe('useMobileDialogViewport', () => {
	let viewport: EventTarget & { height: number; offsetTop: number }
	let mobile: EventTarget & { matches: boolean }

	beforeEach(() => {
		viewport = Object.assign(new EventTarget(), { height: 750, offsetTop: 0 })
		mobile = Object.assign(new EventTarget(), { matches: true })
		vi.stubGlobal('visualViewport', viewport)
		vi.stubGlobal('matchMedia', () => mobile)
		vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
			callback(0)
			return 1
		})
		vi.stubGlobal('cancelAnimationFrame', vi.fn())
	})

	afterEach(() => {
		cleanup()
		vi.unstubAllGlobals()
	})

	it('tracks keyboard height and viewport panning after the portal mounts', () => {
		const { rerender } = render(<Harness mounted={false} />)
		rerender(<Harness />)
		const dialog = screen.getByTestId('dialog')
		expect(dialog.style.getPropertyValue('--dialog-viewport-height')).toBe('750px')

		act(() => {
			viewport.height = 380
			viewport.offsetTop = 120
			viewport.dispatchEvent(new Event('resize'))
		})
		expect(dialog.style.getPropertyValue('--dialog-viewport-height')).toBe('380px')
		expect(dialog.style.getPropertyValue('--dialog-viewport-top')).toBe('120px')

		act(() => {
			viewport.offsetTop = 60
			viewport.dispatchEvent(new Event('scroll'))
		})
		expect(dialog.style.getPropertyValue('--dialog-viewport-top')).toBe('60px')
	})

	it('clears mobile sizing on desktop and after closing', () => {
		const { rerender } = render(<Harness />)
		const dialog = screen.getByTestId('dialog')
		act(() => {
			mobile.matches = false
			mobile.dispatchEvent(new Event('change'))
		})
		expect(dialog.style.getPropertyValue('--dialog-viewport-height')).toBe('')

		act(() => {
			mobile.matches = true
			mobile.dispatchEvent(new Event('change'))
		})
		expect(dialog.style.getPropertyValue('--dialog-viewport-height')).toBe('750px')

		rerender(<Harness open={false} />)
		act(() => viewport.dispatchEvent(new Event('resize')))
		expect(dialog.style.getPropertyValue('--dialog-viewport-height')).toBe('')
		expect(dialog.style.getPropertyValue('--dialog-viewport-top')).toBe('')
	})

	it('falls back to window height without the Visual Viewport API', () => {
		vi.stubGlobal('visualViewport', undefined)
		render(<Harness />)
		expect(screen.getByTestId('dialog').style.getPropertyValue('--dialog-viewport-height')).toBe(`${window.innerHeight}px`)
	})
})
