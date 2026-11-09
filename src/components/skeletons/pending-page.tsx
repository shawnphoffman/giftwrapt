import { type ReactNode, useEffect } from 'react'

// How long after a pending page unmounts the next page still skips its
// entrance animation. Long enough for the route that replaces it to mount.
const SKIP_WINDOW_MS = 1000

let clearTimer: ReturnType<typeof setTimeout> | undefined

// A route's pendingComponent page. Every `.wish-page` fades in on mount
// (animate-page-in), which is right for a normal navigation but wrong
// straight after a skeleton: the skeleton would vanish and the page would
// fade in from blank. While this is mounted, and briefly after, the
// `data-skip-page-in` mark on <html> makes the next page's entrance finish
// instantly (see styles.css), so the skeleton hands over without a flash.
export function PendingPage({ children }: { children: ReactNode }) {
	useEffect(() => {
		const html = document.documentElement
		clearTimeout(clearTimer)
		html.setAttribute('data-skip-page-in', '')
		return () => {
			clearTimeout(clearTimer)
			clearTimer = setTimeout(() => html.removeAttribute('data-skip-page-in'), SKIP_WINDOW_MS)
		}
	}, [])

	return (
		<div className="wish-page" data-pending-page="">
			<div className="flex flex-col flex-1 gap-6">{children}</div>
		</div>
	)
}
