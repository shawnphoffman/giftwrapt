import { useReducedMotion } from 'motion/react'
import { type ReactNode, useState } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Returns a `[key, replay]` tuple. Pass `key` to a child to force a remount;
 * call `replay()` to bump it. Used by every prototype to retrigger.
 */
export function useReplayKey(initial = 0) {
	const [key, setKey] = useState(initial)
	return [key, () => setKey(k => k + 1)] as const
}

type StageProps = {
	title: string
	inspiration?: string
	onReplay?: () => void
	replayLabel?: string
	children: ReactNode
	className?: string
}

/**
 * Standard prototype frame: title, inspiration source, replay button,
 * and a centered stage area for the animated subject.
 */
export function PrototypeStage({ title, inspiration, onReplay, replayLabel = 'Replay', children, className }: StageProps) {
	const reduced = useReducedMotion()
	return (
		<div className={cn('flex w-full max-w-3xl flex-col gap-4 rounded-xl border bg-card p-6 text-card-foreground', className)}>
			<header className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-1">
					<h2 className="text-base font-semibold leading-tight">{title}</h2>
					{inspiration ? <p className="text-xs text-muted-foreground">Inspired by: {inspiration}</p> : null}
					{reduced ? <p className="text-xs text-amber-500">Reduced motion is active. Animations degrade to instant.</p> : null}
				</div>
				{onReplay ? (
					<Button variant="outline" size="sm" onClick={onReplay} type="button">
						{replayLabel}
					</Button>
				) : null}
			</header>
			<div className="flex min-h-48 items-center justify-center rounded-lg bg-muted/30 p-6">{children}</div>
		</div>
	)
}

/**
 * Wraps a story in CSS that forces `prefers-reduced-motion: reduce` semantics
 * by overriding `useReducedMotion`. Motion's hook reads from the media query,
 * so we surface a runtime override via context inside each prototype where
 * needed. For storybook, we just style a notice and rely on the OS setting.
 */
export function ReducedMotionNotice() {
	return (
		<p className="text-xs text-muted-foreground">
			This story honors the OS-level <code>prefers-reduced-motion</code> setting. To preview, toggle reduced motion in your OS accessibility
			settings.
		</p>
	)
}
