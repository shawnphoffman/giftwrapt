import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { CalendarClock, Clock, Info, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { cancelArchiveDefer, forceArchiveList, setArchiveDefer } from '@/api/archive-defer'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { ArchiveBannerInfo } from '@/lib/archive-schedule-loader'
import { itemsKeys } from '@/lib/queries/items'

const DAY_MS = 86_400_000

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const DEFER_ERROR_COPY: Record<string, string> = {
	'not-found': 'List not found.',
	'not-authorized': "You don't have permission to do that.",
	'not-applicable': "This list doesn't auto-archive.",
	'too-early': 'You can only do this once the event has passed.',
	'must-be-later': 'Pick a date later than the current reveal date.',
	'exceeds-max': 'That date is beyond the maximum extension allowed.',
	deferred: 'Cancel the current extension before revealing.',
}

// Edit-view banner: the reveal date plus the management controls
// (force-reveal-now, extend, cancel extension) and a help dialog. Renders
// nothing for list types that never auto-archive.
export function ArchiveManagerBanner({
	listId,
	archiveInfo,
	recipientName,
}: {
	listId: number
	archiveInfo: ArchiveBannerInfo
	recipientName: string
}) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const [helpOpen, setHelpOpen] = useState(false)
	const [forceOpen, setForceOpen] = useState(false)
	const [extendOpen, setExtendOpen] = useState(false)
	const [customDate, setCustomDate] = useState<string | undefined>(undefined)
	const [busy, setBusy] = useState(false)

	if (!archiveInfo.applies || !archiveInfo.effectiveArchiveDate) return null

	const effective = archiveInfo.effectiveArchiveDate
	const dateStr = formatDate(effective)
	const extended = archiveInfo.deferUntil != null

	async function refresh() {
		await Promise.all([queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) }), router.invalidate()])
	}

	async function handleForce() {
		const res = await forceArchiveList({ data: { listId } })
		if (res.kind === 'ok') {
			toast.success('Gifts revealed', { description: `${res.updated} item(s) and ${res.addonsArchived} add-on(s) revealed.` })
			await refresh()
		} else {
			toast.error(DEFER_ERROR_COPY[res.reason] ?? 'Could not reveal gifts.')
		}
	}

	async function applyDefer(target: Date) {
		setBusy(true)
		try {
			const res = await setArchiveDefer({ data: { listId, deferUntil: target } })
			if (res.kind === 'ok') {
				toast.success('Reveal extended', { description: `Now reveals on ${formatDate(res.deferUntil)}.` })
				setExtendOpen(false)
				setCustomDate(undefined)
				await refresh()
			} else {
				toast.error(DEFER_ERROR_COPY[res.reason] ?? 'Could not extend the reveal.')
			}
		} finally {
			setBusy(false)
		}
	}

	async function handleCancel() {
		setBusy(true)
		try {
			const res = await cancelArchiveDefer({ data: { listId } })
			if (res.kind === 'ok') {
				toast.success('Extension cancelled')
				await refresh()
			} else {
				toast.error(DEFER_ERROR_COPY[res.reason] ?? 'Could not cancel the extension.')
			}
		} finally {
			setBusy(false)
		}
	}

	const presets = [
		{ label: '+1 week', days: 7 },
		{ label: '+2 weeks', days: 14 },
		{ label: '+1 month', days: 30 },
	]

	return (
		<Alert>
			<CalendarClock className="size-4" />
			<AlertTitle className="flex items-center gap-2">
				Gifts reveal on {dateStr}
				{extended && <span className="text-muted-foreground text-xs font-normal">(extended)</span>}
			</AlertTitle>
			<AlertDescription className="flex flex-col gap-3">
				<span>
					Claimed gifts stay hidden from {recipientName} until {dateStr}, then reveal automatically on their Received Gifts page.
				</span>

				<div className="flex flex-wrap items-center gap-2">
					{archiveInfo.inForceWindow && (
						<Button type="button" size="sm" onClick={() => setForceOpen(true)}>
							<Send className="size-4" />
							Reveal now
						</Button>
					)}
					{archiveInfo.eventHasPassed && (
						<Button type="button" size="sm" variant="outline" onClick={() => setExtendOpen(true)}>
							<Clock className="size-4" />
							{extended ? 'Extend further' : 'Extend reveal'}
						</Button>
					)}
					{extended && (
						<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={handleCancel}>
							Cancel extension
						</Button>
					)}
					<Button type="button" variant="ghost" size="sm" className="text-muted-foreground" onClick={() => setHelpOpen(true)}>
						<Info className="size-4" />
						How does this work?
					</Button>
				</div>
			</AlertDescription>

			<ConfirmDialog
				open={forceOpen}
				onOpenChange={setForceOpen}
				title="Reveal all gifts now?"
				description={
					<>
						This reveals every claimed item and gifter-volunteered add-on to {recipientName} on their Received Gifts page, and sends the
						reveal email if enabled. Only do this once the gifts have been received. This can&apos;t be undone in bulk.
					</>
				}
				confirmLabel="Reveal now"
				confirmBusyLabel="Revealing…"
				onConfirm={handleForce}
			/>

			<Dialog open={extendOpen} onOpenChange={setExtendOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Extend the reveal</DialogTitle>
						<DialogDescription>
							Delay when claimed gifts on this list become visible to {recipientName}. Useful when the event is close to another occasion
							(e.g. a graduation just before a birthday) so a gift isn&apos;t revealed early. Currently reveals on {dateStr}.
						</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-4">
						<div className="flex flex-wrap gap-2">
							{presets.map(p => (
								<Button
									key={p.label}
									type="button"
									variant="outline"
									size="sm"
									disabled={busy}
									onClick={() => applyDefer(new Date(new Date(effective).getTime() + p.days * DAY_MS))}
								>
									{p.label}
								</Button>
							))}
						</div>
						<div className="flex flex-col gap-2">
							<span className="text-sm text-muted-foreground">Or pick a date:</span>
							<DatePicker value={customDate} onChange={setCustomDate} placeholder="YYYY-MM-DD" />
						</div>
					</div>
					<DialogFooter>
						<Button type="button" variant="ghost" onClick={() => setExtendOpen(false)} disabled={busy}>
							Cancel
						</Button>
						<Button
							type="button"
							disabled={busy || !customDate}
							onClick={() => customDate && applyDefer(new Date(`${customDate}T23:59:59`))}
						>
							Extend to date
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog open={helpOpen} onOpenChange={setHelpOpen}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Reveal timing</DialogTitle>
						<DialogDescription>How and when claimed gifts are revealed.</DialogDescription>
					</DialogHeader>
					<div className="flex flex-col gap-3 text-sm text-muted-foreground">
						<p>
							Claimed gifts are hidden from {recipientName} to protect the surprise. They reveal automatically a set number of days after
							the event date, the date shown on this banner.
						</p>
						<p>
							<strong>Reveal now</strong> releases everything immediately (only available once the event has passed).{' '}
							<strong>Extend</strong> pushes the reveal later, handy when the event is close to another gift-giving occasion.
						</p>
						<p>An active extension blocks &ldquo;Reveal now&rdquo; on purpose, cancel the extension first if you want to reveal early.</p>
					</div>
				</DialogContent>
			</Dialog>
		</Alert>
	)
}
