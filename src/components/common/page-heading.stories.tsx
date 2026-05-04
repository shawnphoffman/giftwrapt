import type { Meta, StoryObj } from '@storybook/react-vite'
import {
	FlaskConical,
	Inbox,
	ListChecks,
	ListOrdered,
	ListPlus,
	Lock,
	type LucideIcon,
	MessagesSquare,
	PackageOpen,
	Receipt,
	Settings,
	Sparkles,
	SquarePlus,
	WandSparkles,
} from 'lucide-react'

import { cn } from '@/lib/utils'

import { PageHeading } from './page-heading'

const meta = {
	title: 'Common/Icons/PageAndDialogIcons',
	parameters: {
		layout: 'padded',
	},
} satisfies Meta<typeof PageHeading>

export default meta
type Story = StoryObj<typeof meta>

type Swatch = { label: string; icon: LucideIcon; bg: string; ring: string }

const PAGE_ICONS: Array<Swatch> = [
	{ label: 'Wish Lists', icon: ListChecks, bg: 'bg-green-500 dark:bg-green-600', ring: 'ring-green-400/40 dark:ring-green-600/40' },
	{ label: 'My Lists', icon: ListOrdered, bg: 'bg-red-500 dark:bg-red-600', ring: 'ring-red-400/40 dark:ring-red-600/40' },
	{
		label: 'Suggestions',
		icon: Sparkles,
		bg: 'bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800',
		ring: 'ring-fuchsia-400/40 dark:ring-fuchsia-600/40',
	},
	{ label: 'Purchases', icon: Receipt, bg: 'bg-pink-500 dark:bg-pink-600', ring: 'ring-pink-400/40 dark:ring-pink-600/40' },
	{ label: 'Received', icon: PackageOpen, bg: 'bg-cyan-500 dark:bg-cyan-600', ring: 'ring-cyan-400/40 dark:ring-cyan-600/40' },
	{ label: 'Recent Items', icon: Inbox, bg: 'bg-purple-500 dark:bg-purple-600', ring: 'ring-purple-400/40 dark:ring-purple-600/40' },
	{ label: 'Recent Comments', icon: MessagesSquare, bg: 'bg-teal-500 dark:bg-teal-600', ring: 'ring-teal-400/40 dark:ring-teal-600/40' },
	{ label: 'Settings', icon: Settings, bg: 'bg-lime-500 dark:bg-lime-600', ring: 'ring-lime-400/40 dark:ring-lime-600/40' },
	{ label: 'Admin', icon: Lock, bg: 'bg-red-500 dark:bg-red-600', ring: 'ring-red-400/40 dark:ring-red-600/40' },
	{
		label: 'Admin Intelligence',
		icon: WandSparkles,
		bg: 'bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800',
		ring: 'ring-fuchsia-400/40 dark:ring-fuchsia-600/40',
	},
	{ label: 'Temp', icon: FlaskConical, bg: 'bg-amber-500 dark:bg-amber-600', ring: 'ring-amber-400/40 dark:ring-amber-600/40' },
]

const DIALOG_ICONS: Array<Swatch> = [
	{ label: 'Add an item', icon: SquarePlus, bg: 'bg-blue-500 dark:bg-blue-600', ring: 'ring-blue-400/40 dark:ring-blue-600/40' },
	{
		label: 'Create a new list',
		icon: ListPlus,
		bg: 'bg-yellow-500 dark:bg-yellow-600',
		ring: 'ring-yellow-400/40 dark:ring-yellow-600/40',
	},
]

function PageIconSwatch({ label, icon: Icon, bg, ring }: Swatch) {
	return (
		<div className="flex flex-col items-start gap-2 rounded-md border border-border bg-muted/10 p-3">
			<span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl shadow-sm ring-1', bg, ring)}>
				<Icon className="size-7 shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
			</span>
			<span className="text-xs font-medium leading-tight">{label}</span>
		</div>
	)
}

function DialogIconSwatch({ label, icon: Icon, bg, ring }: Swatch) {
	return (
		<div className="flex items-center gap-2 rounded-md border border-border bg-muted/10 p-3">
			<span className={cn('flex size-7 shrink-0 items-center justify-center rounded-md shadow-sm ring-1', bg, ring)}>
				<Icon className="size-[21px] shrink-0 text-white drop-shadow-[0_0_4px_rgba(255,255,255,0.4)]" />
			</span>
			<span className="text-xs font-medium leading-tight">{label}</span>
		</div>
	)
}

/**
 * Page heading icons (size-10 colored bg, white glyph at 75% / size-7).
 * Drives the `<PageHeading>` component shared across every top-level page.
 */
export const PageIcons: Story = {
	render: () => (
		<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-w-3xl">
			{PAGE_ICONS.map(s => (
				<PageIconSwatch key={s.label} {...s} />
			))}
		</div>
	),
}

/**
 * Compact dialog title icons (size-7 bg, size-[21px] glyph - 75%) used inside
 * `<DialogTitle>`. The color matches the sidebar entry that triggers the dialog.
 */
export const DialogIcons: Story = {
	render: () => (
		<div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-w-2xl">
			{DIALOG_ICONS.map(s => (
				<DialogIconSwatch key={s.label} {...s} />
			))}
		</div>
	),
}

/** Live `<PageHeading>` component example for the most common color variants. */
export const ComponentExamples: Story = {
	render: () => (
		<div className="flex flex-col gap-6">
			<PageHeading title="Wish Lists" icon={ListChecks} color="green" />
			<PageHeading title="My Lists" icon={ListOrdered} color="red" />
			<PageHeading title="Settings" icon={Settings} color="lime" />
			<PageHeading title="Admin" icon={Lock} color="red" titleClassName="text-red-500" />
			<PageHeading
				title="Suggestions"
				icon={Sparkles}
				iconBgClassName="bg-gradient-to-br from-amber-500 via-pink-500 to-fuchsia-600 dark:from-amber-700 dark:via-pink-700 dark:to-fuchsia-800"
				iconRingClassName="ring-1 ring-fuchsia-400/40 dark:ring-fuchsia-600/40"
			/>
		</div>
	),
}
