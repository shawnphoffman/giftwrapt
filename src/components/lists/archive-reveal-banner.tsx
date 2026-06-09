import { CalendarClock, Info } from 'lucide-react'
import { useState } from 'react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { ArchiveBannerInfo } from '@/lib/archive-schedule-loader'

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

// Gifting-view banner: tells gifters when their claims become visible to the
// recipient. Read-only; the management controls live on the edit view. Renders
// nothing for list types that never auto-archive (giftideas/todos), inactive
// lists, dependent-subject lists, or holiday lists with no holiday picked.
export function ArchiveRevealBanner({ archiveInfo, recipientName }: { archiveInfo: ArchiveBannerInfo; recipientName: string }) {
	const [helpOpen, setHelpOpen] = useState(false)
	if (!archiveInfo.applies || !archiveInfo.effectiveArchiveDate) return null

	const dateStr = formatDate(archiveInfo.effectiveArchiveDate)
	const extended = archiveInfo.deferUntil != null

	return (
		<Alert>
			<CalendarClock className="size-4" />
			<AlertTitle className="flex items-center gap-2">
				Gifts reveal on {dateStr}
				{extended && <span className="text-muted-foreground text-xs font-normal">(reveal extended)</span>}
			</AlertTitle>
			<AlertDescription className="flex flex-col gap-2">
				<span>
					Anything you claim here stays hidden from {recipientName} until {dateStr}, so the surprise holds. After that, your gift is
					revealed on their Received Gifts page.
				</span>
				<Dialog open={helpOpen} onOpenChange={setHelpOpen}>
					<DialogTrigger asChild>
						<Button type="button" variant="ghost" size="sm" className="w-fit -ml-2 text-muted-foreground">
							<Info className="size-4" />
							How does this work?
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>When gifts are revealed</DialogTitle>
							<DialogDescription>How claim visibility and auto-reveal work on this list.</DialogDescription>
						</DialogHeader>
						<div className="flex flex-col gap-3 text-sm text-muted-foreground">
							<p>
								To protect the surprise, {recipientName} can&apos;t see who claimed or purchased an item until the gifts are revealed.
								Claims stay hidden from them in the meantime.
							</p>
							<p>
								Gifts on this list reveal automatically a set number of days after the event date. The reveal date shown above is when
								{` ${recipientName}`} will see what was claimed.
							</p>
							{extended && (
								<p>The reveal on this list has been intentionally delayed by someone who manages it, so it&apos;s later than usual.</p>
							)}
						</div>
					</DialogContent>
				</Dialog>
			</AlertDescription>
		</Alert>
	)
}
