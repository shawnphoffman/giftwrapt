import { useState } from 'react'

import { badgeVariants } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { ArchiveBannerInfo } from '@/lib/archive-schedule-loader'
import { formatDate } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

// Event and default reveal dates are calendar dates sent as UTC midnight of
// the date, so they format in UTC; a defer is a real instant and formats in
// the viewer's zone.
function formatLong(iso: string, calendar: boolean): string {
	return formatDate(iso, { month: 'long', day: 'numeric', year: 'numeric', timeZone: calendar ? 'UTC' : undefined })
}

function formatShort(iso: string, calendar: boolean): string {
	return formatDate(iso, { month: 'short', day: 'numeric', timeZone: calendar ? 'UTC' : undefined })
}

// Gifting-view badge: a compact, tappable chip that sits inline with the list
// title and opens a dialog explaining when claims become visible to the
// recipient. Renders nothing for list types that never auto-archive.
export function ArchiveRevealBadge({ archiveInfo, recipientName }: { archiveInfo: ArchiveBannerInfo; recipientName: string }) {
	const [open, setOpen] = useState(false)
	if (!archiveInfo.applies || !archiveInfo.effectiveArchiveDate) return null

	const extended = archiveInfo.deferUntil != null
	const longDate = formatLong(archiveInfo.effectiveArchiveDate, !extended)
	const shortDate = formatShort(archiveInfo.effectiveArchiveDate, !extended)

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				className={cn(badgeVariants({ variant: 'secondary' }), 'h-7 shrink-0 cursor-pointer hover:bg-secondary/80')}
				title={m.lists_reveal_badge_title({ date: longDate })}
				aria-label={m.lists_reveal_details_badge_label({ date: longDate })}
			>
				<span>{m.lists_reveal_badge_text({ date: shortDate })}</span>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="pr-10">{m.lists_reveal_dialog_title({ date: longDate })}</DialogTitle>
					<DialogDescription>{m.lists_reveal_details_description()}</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3 text-sm text-muted-foreground">
					<p>{m.lists_reveal_details_hidden_until({ recipientName, date: longDate })}</p>
					<p>{m.lists_reveal_details_automatic()}</p>
					{extended && <p>{m.lists_reveal_details_delayed()}</p>}
				</div>
			</DialogContent>
		</Dialog>
	)
}
