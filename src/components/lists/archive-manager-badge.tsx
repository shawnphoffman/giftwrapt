import { useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Clock, Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { cancelArchiveDefer, forceArchiveList, setArchiveDefer } from '@/api/archive-defer'
import { RichMessage } from '@/components/common/rich-message'
import { badgeVariants } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import type { ArchiveBannerInfo } from '@/lib/archive-schedule-loader'
import { formatDate } from '@/lib/i18n/format'
import { itemsKeys } from '@/lib/queries/items'
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

// A preset extension: the end of the viewer's day `days` after the current
// reveal date, matching the custom picker's `T23:59:59` local deadline.
function endOfDayAfter(iso: string, calendar: boolean, days: number): Date {
	const d = new Date(iso)
	const [y, month, day] = calendar ? [d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()] : [d.getFullYear(), d.getMonth(), d.getDate()]
	return new Date(y, month, day + days, 23, 59, 59)
}

// Reason code from the archive-defer server fns to the text shown in the
// toast. A function, not a table: a table would be worded once, when the
// module loads, before any request has a language.
function deferErrorMessage(reason: string): string | undefined {
	switch (reason) {
		case 'not-found':
			return m.lists_reveal_error_not_found()
		case 'not-authorized':
			return m.lists_reveal_error_not_authorized()
		case 'not-applicable':
			return m.lists_reveal_error_not_applicable()
		case 'too-early':
			return m.lists_reveal_error_too_early()
		case 'must-be-later':
			return m.lists_reveal_error_must_be_later()
		case 'exceeds-max':
			return m.lists_reveal_error_exceeds_max()
		case 'deferred':
			return m.lists_reveal_error_deferred()
		default:
			return undefined
	}
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
	const eventDate = archiveInfo.eventDate
	const extended = archiveInfo.deferUntil != null
	const longDate = formatLong(effective, !extended)
	const shortDate = formatShort(effective, !extended)

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
				toast.success(m.lists_reveal_forced_toast(), {
					description: m.lists_reveal_forced_toast_description({ items: res.updated, addons: res.addonsArchived }),
				})
				setOpen(false)
				reset()
				await refresh()
			} else {
				toast.error(deferErrorMessage(res.reason) ?? m.lists_reveal_force_failed())
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
				toast.success(m.lists_reveal_extended_toast(), {
					description: m.lists_reveal_extended_toast_description({ date: formatLong(res.deferUntil, false) }),
				})
				setOpen(false)
				reset()
				await refresh()
			} else {
				toast.error(deferErrorMessage(res.reason) ?? m.lists_reveal_extend_failed())
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
				toast.success(m.lists_reveal_extension_cancelled())
				setOpen(false)
				reset()
				await refresh()
			} else {
				toast.error(deferErrorMessage(res.reason) ?? m.lists_reveal_cancel_failed())
			}
		} finally {
			setBusy(false)
		}
	}

	const presets = [
		{ label: m.lists_reveal_preset_week(), days: 7 },
		{ label: m.lists_reveal_preset_two_weeks(), days: 14 },
		{ label: m.lists_reveal_preset_month(), days: 30 },
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
				title={extended ? m.lists_reveal_badge_title_extended({ date: longDate }) : m.lists_reveal_badge_title({ date: longDate })}
				aria-label={m.lists_reveal_manage_badge_label({ date: longDate })}
			>
				<span>{extended ? m.lists_reveal_badge_text_extended({ date: shortDate }) : m.lists_reveal_badge_text({ date: shortDate })}</span>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="pr-10">
						{extended ? (
							<RichMessage
								parts={m.lists_reveal_dialog_title_extended.parts({ date: longDate })}
								tags={{ note: children => <span className="text-muted-foreground text-sm font-normal">{children}</span> }}
							/>
						) : (
							m.lists_reveal_dialog_title({ date: longDate })
						)}
					</DialogTitle>
					<DialogDescription>{m.lists_reveal_manage_description({ recipientName })}</DialogDescription>
				</DialogHeader>

				{mode === 'menu' && (
					<div className="flex flex-col gap-3">
						<div className="flex flex-col gap-1 text-sm text-muted-foreground">
							{archiveInfo.eventHasPassed ? (
								<p>
									<RichMessage
										parts={m.lists_reveal_menu_help_passed.parts()}
										tags={{ strong: children => <strong className="text-foreground">{children}</strong> }}
									/>
								</p>
							) : (
								<p>
									{eventDate
										? m.lists_reveal_menu_help_after_date({ date: formatLong(eventDate, true) })
										: m.lists_reveal_menu_help_after_event()}
								</p>
							)}
							{extended && <p>{m.lists_reveal_menu_extension_blocks()}</p>}
						</div>
						<div className="flex flex-wrap gap-2">
							{archiveInfo.inForceWindow && (
								<Button type="button" size="sm" onClick={() => setMode('confirmForce')}>
									<Send className="size-4" />
									{m.lists_reveal_now_button()}
								</Button>
							)}
							{archiveInfo.eventHasPassed && (
								<Button type="button" size="sm" variant="outline" onClick={() => setMode('extend')}>
									<Clock className="size-4" />
									{extended ? m.lists_reveal_extend_further_button() : m.lists_reveal_extend_button()}
								</Button>
							)}
							{extended && (
								<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={handleCancel}>
									{m.lists_reveal_cancel_extension_button()}
								</Button>
							)}
						</div>
					</div>
				)}

				{mode === 'confirmForce' && (
					<div className="flex flex-col gap-3">
						<p className="text-sm text-muted-foreground">{m.lists_reveal_force_confirm_body({ recipientName })}</p>
						<div className="flex justify-end gap-2">
							<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMode('menu')}>
								{m.action_back()}
							</Button>
							<Button type="button" size="sm" disabled={busy} onClick={handleForce}>
								{busy ? m.lists_reveal_force_busy() : m.lists_reveal_force_confirm_button()}
							</Button>
						</div>
					</div>
				)}

				{mode === 'extend' && (
					<div className="flex flex-col gap-4">
						<p className="text-sm text-muted-foreground">{m.lists_reveal_extend_body({ recipientName, date: longDate })}</p>
						<div className="flex flex-wrap gap-2">
							{presets.map(p => (
								<Button
									key={p.days}
									type="button"
									variant="outline"
									size="sm"
									disabled={busy}
									onClick={() => applyDefer(endOfDayAfter(effective, !extended, p.days))}
								>
									{p.label}
								</Button>
							))}
						</div>
						<div className="flex flex-col gap-2">
							<span className="text-sm text-muted-foreground">{m.lists_reveal_extend_pick_date()}</span>
							<DatePicker value={customDate} onChange={setCustomDate} placeholder={m.lists_reveal_extend_date_placeholder()} />
						</div>
						<div className="flex justify-end gap-2">
							<Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setMode('menu')}>
								{m.action_back()}
							</Button>
							<Button
								type="button"
								size="sm"
								disabled={busy || !customDate}
								onClick={() => customDate && applyDefer(new Date(`${customDate}T23:59:59`))}
							>
								{m.lists_reveal_extend_to_date_button()}
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	)
}
