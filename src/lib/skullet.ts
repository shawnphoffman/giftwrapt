import { forgetShapes } from 'skullet'
import type { SkulletConfig } from 'skullet/react'

// Skeleton colours follow the app's own tokens, so the class-based theme
// (next-themes toggles `.dark` on <html>) drives them. Skullet's own
// light/dark switch reads prefers-color-scheme, which this app ignores,
// so both entries carry the same token-based values.
const colors = {
	base: 'var(--muted)',
	highlight: 'color-mix(in oklch, var(--muted), var(--foreground) 10%)',
}

export const SKULLET_THEME: NonNullable<SkulletConfig['theme']> = {
	light: colors,
	dark: colors,
	animation: 'shimmer',
	radius: '0.375rem',
}

// Skullet remembers each skeleton's last shape: the real markup in memory
// for the rest of the visit, and a scrambled copy in localStorage across
// visits. The scrambled copy still keeps attributes such as href and
// aria-label, which can carry item titles and URLs. Clear both whenever
// the signed-in identity changes (sign-out, impersonation start and stop)
// so one person's list never shapes, or hides inside, another's skeleton.
export function forgetSkeletonShapes(): void {
	try {
		forgetShapes()
	} catch {
		// localStorage can throw in private windows; nothing to clear then.
	}
}
