import { useEffect, useState } from 'react'

export const MOBILE_DIALOG_QUERY = '(width < 40rem)'

/** Keep a mobile dialog inside the visible viewport when the keyboard opens. */
export function useMobileDialogViewport(open: boolean) {
	const [element, setElement] = useState<HTMLDivElement | null>(null)

	useEffect(() => {
		if (!open || !element) return

		const mobile = window.matchMedia(MOBILE_DIALOG_QUERY)
		const viewport = window.visualViewport
		let frame: number | undefined

		const update = () => {
			if (mobile.matches) {
				element.style.setProperty('--dialog-viewport-top', `${viewport?.offsetTop ?? 0}px`)
				element.style.setProperty('--dialog-viewport-height', `${viewport?.height ?? window.innerHeight}px`)
			} else {
				element.style.removeProperty('--dialog-viewport-top')
				element.style.removeProperty('--dialog-viewport-height')
			}
		}
		const scheduleUpdate = () => {
			if (frame !== undefined) cancelAnimationFrame(frame)
			frame = requestAnimationFrame(() => {
				frame = undefined
				update()
			})
		}

		update()
		viewport?.addEventListener('resize', scheduleUpdate)
		viewport?.addEventListener('scroll', scheduleUpdate)
		window.addEventListener('resize', scheduleUpdate)
		mobile.addEventListener('change', scheduleUpdate)
		return () => {
			if (frame !== undefined) cancelAnimationFrame(frame)
			viewport?.removeEventListener('resize', scheduleUpdate)
			viewport?.removeEventListener('scroll', scheduleUpdate)
			window.removeEventListener('resize', scheduleUpdate)
			mobile.removeEventListener('change', scheduleUpdate)
			element.style.removeProperty('--dialog-viewport-top')
			element.style.removeProperty('--dialog-viewport-height')
		}
	}, [open, element])

	return setElement
}
