import { domAnimation, LazyMotion } from 'motion/react'
import type { ReactNode } from 'react'

type Props = {
	children: ReactNode
}

/**
 * Wraps children in motion's LazyMotion with the dom-animation feature
 * bundle (~6kb). Keeps `motion.*` and `m.*` working but excludes layout
 * animations and drag, which we don't currently use.
 */
export function MotionProvider({ children }: Props) {
	return <LazyMotion features={domAnimation}>{children}</LazyMotion>
}
