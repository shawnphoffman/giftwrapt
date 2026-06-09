import { useState } from 'react'

import { badgeVariants } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { ArchiveBannerInfo } from '@/lib/archive-schedule-loader'
import { cn } from '@/lib/utils'

function formatLong(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatShort(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Gifting-view badge: a compact, tappable chip that sits inline with the list
// title and opens a dialog explaining when claims become visible to the
// recipient. Renders nothing for list types that never auto-archive.
export function ArchiveRevealBadge({ archiveInfo, recipientName }: { archiveInfo: ArchiveBannerInfo; recipientName: string }) {
	const [open, setOpen] = useState(false)
	if (!archiveInfo.applies || !archiveInfo.effectiveArchiveDate) return null

	const longDate = formatLong(archiveInfo.effectiveArchiveDate)
	const shortDate = formatShort(archiveInfo.effectiveArchiveDate)
	const extended = archiveInfo.deferUntil != null

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				className={cn(badgeVariants({ variant: 'secondary' }), 'h-7 shrink-0 cursor-pointer hover:bg-secondary/80')}
				title={`Gifts reveal on ${longDate}`}
				aria-label={`Gifts reveal on ${longDate}. Tap for details.`}
			>
				<span>Revealing: {shortDate}</span>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="pr-10">Gifts reveal on {longDate}</DialogTitle>
					<DialogDescription>How claim visibility works on this list.</DialogDescription>
				</DialogHeader>
				<div className="flex flex-col gap-3 text-sm text-muted-foreground">
					<p>
						Anything you claim here stays hidden from {recipientName} until {longDate}, so the surprise holds. After that, your gift is
						revealed on their Received Gifts page.
					</p>
					<p>Gifts on this list reveal automatically a set number of days after the event date.</p>
					{extended && (
						<p>The reveal on this list has been intentionally delayed by someone who manages it, so it&apos;s later than usual.</p>
					)}
				</div>
			</DialogContent>
		</Dialog>
	)
}
