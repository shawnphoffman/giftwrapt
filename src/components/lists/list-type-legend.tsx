// Help/legend explaining what each list type does. List types aren't
// just decorative - each carries rules, alerts, auto-archiving behavior,
// and outbound emails. Rendered in a modal with a consistent four-field
// shape per type so users can compare them at a glance:
//   - Overview         : what the type is for and any privacy/role gates.
//   - Emails           : what the system sends, when, and to whom.
//   - Auto-archive     : when claimed items get revealed to the recipient.
//   - When you delete  : recipient-side delete behavior, including the
//                        orphan-claim flow for claimed items.
//
// Mirrors the admin list-type toggles (`enableChristmasLists`,
// `enableBirthdayLists`, `enableGenericHolidayLists`, `enableTodoLists`):
// types the deployment has disabled are filtered out so users aren't
// shown rules they can't act on. Wishlist and giftideas are always shown
// (no admin toggle gates them; giftideas has its own role gate handled
// elsewhere).

import { Info } from 'lucide-react'
import { useState } from 'react'

import ListTypeIcon from '@/components/common/list-type-icon'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { ListType } from '@/db/schema/enums'
import { useAppSettings } from '@/hooks/use-app-settings'
import type { AppSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'

type LegendEntry = {
	type: ListType
	label: string
	overview: string
	emails: string
	autoArchive: string
	onDelete: string
	// Returns true when the type is enabled on this deployment. Wishlist
	// and giftideas always return true (no admin toggle).
	isEnabled: (s: AppSettings) => boolean
}

const ENTRIES: ReadonlyArray<LegendEntry> = [
	{
		type: 'wishlist',
		label: 'Wishlist',
		overview:
			'A rolling list with no event date. Items stay until you remove them. Can be public (anyone can shop from it) or private (only editors you add).',
		emails:
			'No event-driven emails. New comments on your items send a notification email if comment emails are enabled and the comment is from someone other than you.',
		autoArchive:
			'No event-anchored archive. You reveal a gift to yourself by archiving the item from the received-gifts page when you have it in hand.',
		onDelete:
			'Removing an unclaimed item is an immediate delete. If a gifter (or their partner) had already claimed the item, the gifter is alerted; if they don’t acknowledge within 14 days, the orphaned claim is automatically cleaned up.',
		isEnabled: () => true,
	},
	{
		type: 'birthday',
		label: 'Birthday',
		overview:
			'A list anchored to your birthday (or a dependent’s, when the list is for one). Drives the recipient-specific reminder cadence and the post-event lifecycle.',
		emails:
			'A pre-birthday reminder goes out to potential gifters a configurable number of days before. After the birthday, you get a recap email summarising what you received.',
		autoArchive:
			'Claimed items auto-archive (revealing the gifters to you) on a configurable offset after your birthday. Unclaimed items stay live for next year.',
		onDelete:
			'Same orphan-alert flow as a wishlist. Unanswered orphans are automatically cleaned up on your birthday so the gifter’s view is tidy by the event date.',
		isEnabled: s => s.enableBirthdayLists,
	},
	{
		type: 'christmas',
		label: 'Christmas',
		overview: 'A list anchored to December 25. Public or private at your choice.',
		emails:
			'A pre-Christmas reminder broadcasts to every active user a configurable number of days before. After Christmas, list owners receive a recap email.',
		autoArchive:
			'Claimed items auto-archive a configurable number of days after Christmas. Unclaimed items stay live and are usually rolled into next year.',
		onDelete:
			'Orphan-alert flow on per-item deletes (gifter is told, can acknowledge). Unanswered orphans are cleaned up on Christmas day.',
		isEnabled: s => s.enableChristmasLists,
	},
	{
		type: 'holiday',
		label: 'Holiday',
		overview:
			'A list anchored to a specific holiday curated by the admin (e.g. Easter, Diwali). The chosen holiday’s next occurrence drives every date in the lifecycle below.',
		emails:
			'A pre-holiday reminder broadcasts a configurable number of days before the resolved holiday date. List owners receive a recap email after the holiday passes.',
		autoArchive: 'Claimed items auto-archive a configurable number of days after the holiday’s resolved date.',
		onDelete: 'Orphan-alert flow on per-item deletes. Unanswered orphans are cleaned up on the holiday date.',
		isEnabled: s => s.enableGenericHolidayLists,
	},
	{
		type: 'giftideas',
		label: 'Gift Ideas',
		overview:
			'Always private. A scratchpad for ideas you have for someone else (a user or a dependent), never visible to that person. No event date.',
		emails: 'None. Gift ideas live entirely on your side; no notifications fire.',
		autoArchive: 'None. Gift-ideas items don’t flow through the claim or reveal lifecycle.',
		onDelete: 'Items hard-delete immediately. There’s no claim flow on a gift-ideas list, so the orphan-alert path doesn’t apply.',
		isEnabled: () => true,
	},
	{
		type: 'todos',
		label: 'Todos',
		overview:
			'A separate row shape from gift items: no price, quantity, image, vendor, or claims. "Claiming" a todo marks it done. Anyone with view access can toggle.',
		emails: 'None. Todos are status-tracking, not gifting, so no reminder, recap, or comment emails fire.',
		autoArchive: 'None. Todos use a single done/not-done flag; there is no spoiler-protection reveal step.',
		onDelete: 'Items hard-delete immediately. There’s no spoiler protection, so there is nothing to orphan.',
		isEnabled: s => s.enableTodoLists,
	},
]

export function ListTypeLegend({ className }: { className?: string }) {
	const [open, setOpen] = useState(false)
	const { data: settings } = useAppSettings()
	// While settings load, render the always-on rows (wishlist + giftideas)
	// only so the panel doesn't flash gated rows in then yank them out.
	const visible = settings
		? ENTRIES.filter(e => e.isEnabled(settings))
		: ENTRIES.filter(e => e.type === 'wishlist' || e.type === 'giftideas')
	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className={cn('h-7 -mt-2 self-start text-xs text-muted-foreground hover:text-foreground', className)}
				>
					<Info className="size-3.5" />
					What do the list types mean?
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl lg:max-w-3xl">
				<DialogHeader>
					<DialogTitle>List types</DialogTitle>
					<DialogDescription>
						Each list type carries its own rules, emails, and auto-archive behavior. Disabled types on this deployment are hidden.
					</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col divide-y divide-border">
					{visible.map(entry => (
						<LegendRow key={entry.type} entry={entry} />
					))}
				</div>
			</DialogContent>
		</Dialog>
	)
}

function LegendRow({ entry }: { entry: LegendEntry }) {
	return (
		<section className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
			<header className="flex items-center gap-2.5">
				<ListTypeIcon type={entry.type} className="size-6 shrink-0" />
				<h3 className="text-lg font-semibold leading-none">{entry.label}</h3>
			</header>
			<dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
				<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-0.5">Overview</dt>
				<dd className="text-foreground/90 leading-snug">{entry.overview}</dd>
				<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-0.5">Emails</dt>
				<dd className="text-foreground/90 leading-snug">{entry.emails}</dd>
				<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-0.5">Auto-archive</dt>
				<dd className="text-foreground/90 leading-snug">{entry.autoArchive}</dd>
				<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-0.5">When you delete</dt>
				<dd className="text-foreground/90 leading-snug">{entry.onDelete}</dd>
			</dl>
		</section>
	)
}
