import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'

// Static color map so Tailwind's JIT scanner can see every class. Adding a
// new color requires adding an entry here, but in return we keep tree-shake
// friendly utility classes instead of arbitrary values.
const COLORS = {
	red: { bg: 'bg-red-500 dark:bg-red-600', ring: 'ring-1 ring-red-400/40 dark:ring-red-600/40' },
	green: { bg: 'bg-green-500 dark:bg-green-600', ring: 'ring-1 ring-green-400/40 dark:ring-green-600/40' },
	lime: { bg: 'bg-lime-500 dark:bg-lime-600', ring: 'ring-1 ring-lime-400/40 dark:ring-lime-600/40' },
	pink: { bg: 'bg-pink-500 dark:bg-pink-600', ring: 'ring-1 ring-pink-400/40 dark:ring-pink-600/40' },
	cyan: { bg: 'bg-cyan-500 dark:bg-cyan-600', ring: 'ring-1 ring-cyan-400/40 dark:ring-cyan-600/40' },
	purple: { bg: 'bg-purple-500 dark:bg-purple-600', ring: 'ring-1 ring-purple-400/40 dark:ring-purple-600/40' },
	teal: { bg: 'bg-teal-500 dark:bg-teal-600', ring: 'ring-1 ring-teal-400/40 dark:ring-teal-600/40' },
	amber: { bg: 'bg-amber-500 dark:bg-amber-600', ring: 'ring-1 ring-amber-400/40 dark:ring-amber-600/40' },
	fuchsia: { bg: 'bg-fuchsia-500 dark:bg-fuchsia-600', ring: 'ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40' },
} as const

export type PageHeadingColor = keyof typeof COLORS

type Props = {
	title: React.ReactNode
	icon: LucideIcon
	/** Page accent color used for the icon background. Icon glyph is rendered white. */
	color?: PageHeadingColor
	/** Optional gradient classes that replace the solid `color` background. */
	iconBgClassName?: string
	/** Optional ring classes that replace the default ring derived from `color`. */
	iconRingClassName?: string
	titleClassName?: string
	className?: string
	children?: React.ReactNode
}

export function PageHeading({ title, icon: Icon, color, iconBgClassName, iconRingClassName, titleClassName, className, children }: Props) {
	const palette = color ? COLORS[color] : null
	const bgClass = iconBgClassName ?? palette?.bg ?? ''
	const ringClass = iconRingClassName ?? palette?.ring ?? ''
	return (
		<div className={cn('flex flex-row items-center justify-between gap-3 flex-wrap', className)}>
			<h1 className={cn('flex flex-row items-center gap-3', titleClassName)}>
				<span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm', bgClass, ringClass)}>
					<Icon className="size-7 shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
				</span>
				{title}
			</h1>
			{children}
		</div>
	)
}
