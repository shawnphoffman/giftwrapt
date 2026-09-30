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
			'A rolling list with no event of its own. Items stay until you remove them. Can be public (anyone can shop from it) or private (only editors you add).',
		emails:
			'When claimed gifts are revealed after your birthday, you get an email showing who gave you what. If comment emails are turned on, you also get an email when someone else comments on one of your items.',
		autoArchive:
			'Claimed items are archived automatically a configurable number of days after your birthday, which reveals who gave them. If you haven’t set a birthday, nothing is archived automatically.',
		onDelete:
			'Removing an unclaimed item deletes it right away. If a gifter (or their partner) already claimed it, the gifter gets an alert. If they don’t acknowledge it within 14 days, their claim is cleaned up automatically.',
		isEnabled: () => true,
	},
	{
		type: 'birthday',
		label: 'Birthday',
		overview:
			'A list tied to your birthday (or a dependent’s, when the list is for one). That date decides when reminders go out and what happens after the day.',
		emails:
			'A pre-birthday reminder goes out to potential gifters a configurable number of days before. When claimed gifts are revealed, you get an email showing who gave you what.',
		autoArchive:
			'Claimed items are archived automatically a configurable number of days after your birthday, which reveals who gave them. Unclaimed items stay on the list for next year.',
		onDelete:
			'Same as a wishlist: if you delete an item someone claimed, the gifter gets an alert. Any alerts they haven’t answered are cleaned up on your birthday, so their view is tidy by then.',
		isEnabled: s => s.enableBirthdayLists,
	},
	{
		type: 'christmas',
		label: 'Christmas',
		overview: 'A list anchored to December 25. Public or private at your choice.',
		emails:
			'A reminder goes out to every active user a configurable number of days before Christmas. When claimed gifts are revealed, list owners get an email showing who gave what.',
		autoArchive:
			'Claimed items are archived automatically a configurable number of days after Christmas. Unclaimed items stay on the list and usually carry over to next year.',
		onDelete:
			'If you delete an item someone claimed, the gifter is told and can acknowledge it. Any alerts they haven’t answered are cleaned up on Christmas Day.',
		isEnabled: s => s.enableChristmasLists,
	},
	{
		type: 'holiday',
		label: 'Holiday',
		overview: 'A list tied to a holiday your admin has set up, such as Easter or Diwali. The holiday’s next date sets all the dates below.',
		emails:
			'A reminder goes out a configurable number of days before the holiday. When claimed gifts are revealed, list owners get an email showing who gave what.',
		autoArchive: 'Claimed items are archived automatically a configurable number of days after the holiday.',
		onDelete: 'If you delete an item someone claimed, the gifter is told. Any alerts they haven’t answered are cleaned up on the holiday.',
		isEnabled: s => s.enableGenericHolidayLists,
	},
	{
		type: 'giftideas',
		label: 'Gift Ideas',
		overview:
			'Always private. A place to jot down gift ideas for someone else (a user or a dependent). That person never sees it. No event date.',
		emails: 'None. Gift ideas stay entirely on your side, and no notifications are sent.',
		autoArchive: 'None. Gift ideas aren’t claimed or revealed like items on other lists.',
		onDelete: 'Items are deleted right away. Nobody claims items on a gift ideas list, so there are no gifter alerts.',
		isEnabled: () => true,
	},
	{
		type: 'todos',
		label: 'Todos',
		overview:
			'Todos are simpler than gift items, with no price, quantity, image, vendor, or claims. "Claiming" a todo marks it done, and anyone who can view the list can check it off.',
		emails: 'None. Todos track tasks, not gifts, so no reminder, recap, or comment emails are sent.',
		autoArchive: 'None. A todo is simply done or not done, so there’s no reveal step.',
		onDelete: 'Items are deleted right away. Nothing is hidden from anyone, so there are no gifter alerts to clean up.',
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
						Each list type has its own rules, emails, and auto-archive behavior. Types that are turned off on this site aren&apos;t shown.
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
