'use client'

import { type HTMLMotionProps, motion } from 'motion/react'

import { cn } from '@/lib/utils'

export type GradientBackgroundMotionProps = HTMLMotionProps<'div'>

export default function GradientBackgroundMotion({
	className,
	transition = { duration: 15, ease: 'easeInOut', repeat: Infinity },
	...props
}: GradientBackgroundMotionProps) {
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
