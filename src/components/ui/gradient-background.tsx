'use client'

import { type ComponentProps, lazy, Suspense } from 'react'

import { cn } from '@/lib/utils'

const GradientBackgroundMotion = lazy(() => import('./gradient-background-motion'))

type GradientBackgroundProps = ComponentProps<typeof GradientBackgroundMotion>

function GradientBackground({ className, ...props }: GradientBackgroundProps) {
	return (
		<Suspense
			fallback={
				<div data-slot="gradient-background" className={cn('size-full bg-linear-to-br from-accent via-background to-accent', className)} />
			}
		>
			<GradientBackgroundMotion className={className} {...props} />
		</Suspense>
	)
}

export { GradientBackground, type GradientBackgroundProps }
