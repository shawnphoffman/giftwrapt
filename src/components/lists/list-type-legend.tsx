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
import { listTypeLabel } from '@/lib/i18n/labels'
import type { AppSettings } from '@/lib/settings'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

type LegendEntry = {
	type: ListType
	// The text fields are functions, called at render: this table is built
	// when the module loads, before any request has a language.
	label: () => string
	overview: () => string
	emails: () => string
	autoArchive: () => string
	onDelete: () => string
	// Returns true when the type is enabled on this deployment. Wishlist
	// and giftideas always return true (no admin toggle).
	isEnabled: (s: AppSettings) => boolean
}

const ENTRIES: ReadonlyArray<LegendEntry> = [
	{
		type: 'wishlist',
		label: () => m.lists_legend_wishlist_label(),
		overview: () => m.lists_legend_wishlist_overview(),
		emails: () => m.lists_legend_wishlist_emails(),
		autoArchive: () => m.lists_legend_wishlist_auto_archive(),
		onDelete: () => m.lists_legend_wishlist_on_delete(),
		isEnabled: () => true,
	},
	{
		type: 'birthday',
		label: () => listTypeLabel('birthday'),
		overview: () => m.lists_legend_birthday_overview(),
		emails: () => m.lists_legend_birthday_emails(),
		autoArchive: () => m.lists_legend_birthday_auto_archive(),
		onDelete: () => m.lists_legend_birthday_on_delete(),
		isEnabled: s => s.enableBirthdayLists,
	},
	{
		type: 'christmas',
		label: () => listTypeLabel('christmas'),
		overview: () => m.lists_legend_christmas_overview(),
		emails: () => m.lists_legend_christmas_emails(),
		autoArchive: () => m.lists_legend_christmas_auto_archive(),
		onDelete: () => m.lists_legend_christmas_on_delete(),
		isEnabled: s => s.enableChristmasLists,
	},
	{
		type: 'holiday',
		label: () => listTypeLabel('holiday'),
		overview: () => m.lists_legend_holiday_overview(),
		emails: () => m.lists_legend_holiday_emails(),
		autoArchive: () => m.lists_legend_holiday_auto_archive(),
		onDelete: () => m.lists_legend_holiday_on_delete(),
		isEnabled: s => s.enableGenericHolidayLists,
	},
	{
		type: 'giftideas',
		label: () => listTypeLabel('giftideas'),
		overview: () => m.lists_legend_giftideas_overview(),
		emails: () => m.lists_legend_giftideas_emails(),
		autoArchive: () => m.lists_legend_giftideas_auto_archive(),
		onDelete: () => m.lists_legend_giftideas_on_delete(),
		isEnabled: () => true,
	},
	{
		type: 'todos',
		label: () => m.lists_legend_todos_label(),
		overview: () => m.lists_legend_todos_overview(),
		emails: () => m.lists_legend_todos_emails(),
		autoArchive: () => m.lists_legend_todos_auto_archive(),
		onDelete: () => m.lists_legend_todos_on_delete(),
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
				<Button variant="outline" size="xs" className={cn('-mt-2 self-start text-muted-foreground hover:text-foreground', className)}>
					<Info className="size-3.5" />
					{m.lists_legend_button()}
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl lg:max-w-3xl">
				<DialogHeader>
					<DialogTitle>{m.lists_legend_title()}</DialogTitle>
					<DialogDescription>{m.lists_legend_description()}</DialogDescription>
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
				<h3 className="text-lg font-semibold leading-none">{entry.label()}</h3>
			</header>
			<dl className="grid grid-cols-[7rem_1fr] gap-x-3 gap-y-2 text-sm">
				<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-0.5">{m.lists_legend_heading_overview()}</dt>
				<dd className="text-foreground/90 leading-snug">{entry.overview()}</dd>
				<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-0.5">{m.lists_legend_heading_emails()}</dt>
				<dd className="text-foreground/90 leading-snug">{entry.emails()}</dd>
				<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-0.5">
					{m.lists_legend_heading_auto_archive()}
				</dt>
				<dd className="text-foreground/90 leading-snug">{entry.autoArchive()}</dd>
				<dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground pt-0.5">{m.lists_legend_heading_on_delete()}</dt>
				<dd className="text-foreground/90 leading-snug">{entry.onDelete()}</dd>
			</dl>
		</section>
	)
}
