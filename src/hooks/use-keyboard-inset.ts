import { useEffect, useState } from 'react'

export const MOBILE_DIALOG_QUERY = '(width < 40rem)'

/**
 * Expose how much of the layout viewport the on-screen keyboard covers as
 * `--keyboard-inset`, so a full-screen mobile dialog can pad its scroll area
 * and still scroll its last fields above the keyboard.
 *
 * Padding is the only thing it changes. Moving or resizing the dialog from
 * the visual viewport made it lurch on iOS: Safari pans the viewport to the
 * focused field, the values change through the keyboard animation, and the
 * dialog chased them a frame behind. Padding at the end of the scroll area
 * moves nothing on screen, so it can follow the keyboard without a jump.
 */
export function useKeyboardInset(open: boolean) {
	const [element, setElement] = useState<HTMLDivElement | null>(null)

	useEffect(() => {
		const viewport = window.visualViewport
		if (!open || !element || !viewport) return

		const mobile = window.matchMedia(MOBILE_DIALOG_QUERY)
		const update = () => {
			const inset = mobile.matches ? Math.max(0, Math.round(window.innerHeight - viewport.height)) : 0
			if (inset > 0) element.style.setProperty('--keyboard-inset', `${inset}px`)
			else element.style.removeProperty('--keyboard-inset')
		}

		update()
		viewport.addEventListener('resize', update)
		mobile.addEventListener('change', update)
		return () => {
			viewport.removeEventListener('resize', update)
			mobile.removeEventListener('change', update)
			element.style.removeProperty('--keyboard-inset')
		}
	}, [open, element])

	return setElement
}
