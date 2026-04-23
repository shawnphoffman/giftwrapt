'use client'

import { motion, type HTMLMotionProps } from 'motion/react'

import { cn } from '@/lib/utils'

type GradientBackgroundProps = HTMLMotionProps<'div'>

function GradientBackground({
	className,
	transition = { duration: 15, ease: 'easeInOut', repeat: Infinity },
	...props
}: GradientBackgroundProps) {
	return (
		<motion.div
			data-slot="gradient-background"
			className={cn('size-full bg-linear-to-br from-accent via-background to-accent bg-size-[400%_400%]', className)}
			animate={{ backgroundPosition: ['0% 50%', '100% 50%', '0% 50%'] }}
			transition={transition}
			{...props}
		/>
	)
}

export { GradientBackground, type GradientBackgroundProps }
