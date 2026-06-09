import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Clock, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { cancelArchiveDefer, forceArchiveList, setArchiveDefer } from '@/api/archive-defer'
import { badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { ArchiveBannerInfo } from '@/lib/archive-schedule-loader'
import { itemsKeys } from '@/lib/queries/items'
import { cn } from '@/lib/utils'

const DAY_MS = 86_400_000

function formatLong(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function formatShort(iso: string): string {
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
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

type Mode = 'menu' | 'confirmForce' | 'extend'

// Edit-view badge: a compact, tappable chip inline with the list title. Opens
// a small dialog with the reveal date, a short explanation, and the management
// actions (reveal now / extend / cancel extension) driven by an inline mode
// machine - no nested modals. Renders nothing for non-auto-archiving lists.
export function ArchiveManagerBadge({
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
	const [open, setOpen] = useState(false)
	const [mode, setMode] = useState<Mode>('menu')
	const [customDate, setCustomDate] = useState<string | undefined>(undefined)
	const [busy, setBusy] = useState(false)

	if (!archiveInfo.applies || !archiveInfo.effectiveArchiveDate) return null

	const effective = archiveInfo.effectiveArchiveDate
	const longDate = formatLong(effective)
	const shortDate = formatShort(effective)
	const extended = archiveInfo.deferUntil != null

	function reset() {
		setMode('menu')
		setCustomDate(undefined)
	}

	async function refresh() {
		await Promise.all([queryClient.invalidateQueries({ queryKey: itemsKeys.byList(listId) }), router.invalidate()])
	}

	async function handleForce() {
		setBusy(true)
		try {
			const res = await forceArchiveList({ data: { listId } })
			if (res.kind === 'ok') {
				toast.success('Gifts revealed', { description: `${res.updated} item(s) and ${res.addonsArchived} add-on(s) revealed.` })
				setOpen(false)
				reset()
				await refresh()
			} else {
				toast.error(DEFER_ERROR_COPY[res.reason] ?? 'Could not reveal gifts.')
			}
		} finally {
			setBusy(false)
		}
	}

	async function applyDefer(target: Date) {
		setBusy(true)
		try {
			const res = await setArchiveDefer({ data: { listId, deferUntil: target } })
			if (res.kind === 'ok') {
				toast.success('Reveal extended', { description: `Now reveals on ${formatLong(res.deferUntil)}.` })
				setOpen(false)
				reset()
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
				setOpen(false)
				reset()
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
		<Dialog
			open={open}
			onOpenChange={next => {
				setOpen(next)
				if (!next) reset()
			}}
		>
			<DialogTrigger
				className={cn(badgeVariants({ variant: 'secondary' }), 'h-7 shrink-0 cursor-pointer hover:bg-secondary/80')}
				title={`Gifts reveal on ${longDate}${extended ? ' (extended)' : ''}`}
				aria-label={`Gifts reveal on ${longDate}. Tap to manage.`}
			>
				<span>
					Revealing: {shortDate}
					{extended ? ' (extended)' : ''}
				</span>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="pr-10">
						Gifts reveal on {longDate}
						{extended && <span className="text-muted-foreground text-sm font-normal"> (extended)</span>}
					</DialogTitle>
					<DialogDescription>Claimed gifts stay hidden from {recipientName} until then, then reveal automatically.</DialogDescription>
				</DialogHeader>

				{mode === 'menu' && (
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1 text-sm text-muted-foreground">
							<p>
								<strong className="text-foreground">Reveal now</strong> releases everything immediately (only once the event has passed).{' '}
								<strong className="text-foreground">Extend</strong> pushes the reveal later, handy when the event is close to another
								occasion.
							</p>
							<p>An active extension blocks &ldquo;Reveal now&rdquo; on purpose, cancel it first to reveal early.</p>
						</div>
						<div className="flex flex-wrap gap-2">
							{archiveInfo.inForceWindow && (
								<Button type="button" size="sm" onClick={() => setMode('confirmForce')}>
									<Send className="size-4" />
									Reveal now
								</Button>
							)}
							{archiveInfo.eventHasPassed && (
								<Button type="button" size="sm" variant="outline" onClick={() => setMode('extend')}>
									<Clock className="size-4" />
									{extended ? 'Extend further' : 'Extend reveal'}
								</Button>
							)}
							{extended && (
								<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={handleCancel}>
									Cancel extension
								</Button>
							)}
						</div>
					</div>
				)}

				{mode === 'confirmForce' && (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-muted-foreground">
							This reveals every claimed item and gifter-volunteered add-on to {recipientName} on their Received Gifts page, and sends the
							reveal email if enabled. Only do this once the gifts have been received. This can&apos;t be undone in bulk.
						</p>
						<div className="flex justify-end gap-2">
							<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMode('menu')}>
								Back
							</Button>
							<Button type="button" size="sm" disabled={busy} onClick={handleForce}>
								{busy ? 'Revealing…' : 'Confirm reveal'}
							</Button>
						</div>
					</div>
				)}

				{mode === 'extend' && (
					<div className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">
							Delay when claimed gifts become visible to {recipientName}, useful when the event is close to another occasion (e.g. a
							graduation just before a birthday). Currently reveals on {longDate}.
						</p>
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
						<div className="flex justify-end gap-2">
							<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMode('menu')}>
								Back
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={busy || !customDate}
								onClick={() => customDate && applyDefer(new Date(`${customDate}T23:59:59`))}
							>
								Extend to date
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
