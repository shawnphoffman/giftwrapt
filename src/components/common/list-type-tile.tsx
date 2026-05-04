import { Cake, CheckCheck, FlaskConical, Gift, Lightbulb, type LucideIcon, TreePine } from 'lucide-react'

import type { ListType } from '@/db/schema/enums'
import { cn } from '@/lib/utils'

// List-type variant of the page-heading icon tile: colored bg square with a
// white glyph at 75%. Mirrors the `<PageHeading>` shape so list-detail and
// list-edit headings look like every other top-level page.

const TYPE_STYLES: Record<ListType, { bg: string; ring: string; icon: LucideIcon }> = {
	wishlist: {
		bg: 'bg-red-500 dark:bg-red-600',
		ring: 'ring-1 ring-red-400/40 dark:ring-red-600/40',
		icon: Gift,
	},
	christmas: {
		bg: 'bg-green-500 dark:bg-green-600',
		ring: 'ring-1 ring-green-400/40 dark:ring-green-600/40',
		icon: TreePine,
	},
	birthday: {
		bg: 'bg-pink-500 dark:bg-pink-600',
		ring: 'ring-1 ring-pink-400/40 dark:ring-pink-600/40',
		icon: Cake,
	},
	giftideas: {
		bg: 'bg-teal-500 dark:bg-teal-600',
		ring: 'ring-1 ring-teal-400/40 dark:ring-teal-600/40',
		icon: Lightbulb,
	},
	todos: {
		bg: 'bg-orange-500 dark:bg-orange-600',
		ring: 'ring-1 ring-orange-400/40 dark:ring-orange-600/40',
		icon: CheckCheck,
	},
	test: {
		bg: 'bg-blue-500 dark:bg-blue-600',
		ring: 'ring-1 ring-blue-400/40 dark:ring-blue-600/40',
		icon: FlaskConical,
	},
}

type Props = {
	type: ListType
	className?: string
}

export default function ListTypeTile({ type, className }: Props) {
	const { bg, ring, icon: Icon } = TYPE_STYLES[type]
	return (
		<span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm', bg, ring, className)}>
			<Icon className="size-7 shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
		</span>
	)
}
