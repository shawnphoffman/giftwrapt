import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Send } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { getListsWithHiddenPurchasesAsAdmin, type HiddenPurchasesListRow, revealListAsAdmin } from '@/api/admin-reveals'
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { errorText } from '@/lib/i18n/errors'
import { formatCalendarDate } from '@/lib/i18n/format'
import { listTypeLabel } from '@/lib/i18n/labels'
import { m } from '@/paraglide/messages.js'

const hiddenPurchasesQueryKey = ['admin', 'hidden-purchases'] as const

function revealErrorText(reason: string): string {
	switch (reason) {
		case 'not-found':
			return m.admin_data_reveal_error_not_found()
		case 'not-applicable':
			return m.admin_data_reveal_error_not_applicable()
		default:
			return m.admin_data_reveal_failed()
	}
}

// Scheduled reveal dates are calendar dates (UTC midnight) unless the list is
// extended; either way the date is what matters here, so format in UTC.
function formatDate(iso: string | null): string {
	if (!iso) return '-'
	return formatCalendarDate(iso, { month: 'short', day: 'numeric', year: 'numeric' })
}

function hiddenLabel(row: HiddenPurchasesListRow): string {
	// The server withholds counts for the admin's own list.
	if (row.isOwnList) return m.admin_data_reveal_hidden_own()
	if (row.hiddenItemCount > 0 && row.hiddenAddonCount > 0) {
		return m.admin_data_reveal_hidden_both({ items: row.hiddenItemCount, addons: row.hiddenAddonCount })
	}
	if (row.hiddenItemCount > 0) return m.admin_data_reveal_hidden_claimed({ count: row.hiddenItemCount })
	if (row.hiddenAddonCount > 0) return m.admin_data_reveal_hidden_off_list({ count: row.hiddenAddonCount })
	return ''
}

export default function HiddenPurchases() {
	const queryClient = useQueryClient()
	const { data: rows, isLoading } = useQuery({
		queryKey: hiddenPurchasesQueryKey,
		queryFn: () => getListsWithHiddenPurchasesAsAdmin(),
		staleTime: 0,
	})
	const [target, setTarget] = useState<HiddenPurchasesListRow | null>(null)
	const [sendEmail, setSendEmail] = useState(false)

	const mutation = useMutation({
		mutationFn: (row: HiddenPurchasesListRow) => revealListAsAdmin({ data: { listId: row.listId, sendEmail } }),
		onSuccess: async res => {
			if (res.kind === 'ok') {
				const counts = { items: res.updated, addons: res.addonsArchived }
				toast.success(m.admin_data_reveal_done_title(), {
					description: target?.isOwnList
						? res.emailSent
							? m.admin_data_reveal_done_own_email()
							: m.admin_data_reveal_done_own()
						: res.emailSent
							? m.admin_data_reveal_done_other_email(counts)
							: m.admin_data_reveal_done_other(counts),
				})
				setTarget(null)
				await queryClient.invalidateQueries({ queryKey: hiddenPurchasesQueryKey })
			} else {
				toast.error(revealErrorText(res.reason))
			}
		},
		onError: err => toast.error(errorText(err, m.admin_data_reveal_failed())),
	})

	if (isLoading || !rows) return <p className="text-sm text-muted-foreground">{m.state_loading()}</p>
	if (rows.length === 0) return <p className="text-sm text-muted-foreground">{m.admin_data_reveal_empty()}</p>

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>{m.admin_data_reveal_col_recipient()}</TableHead>
						<TableHead>{m.admin_data_reveal_col_list()}</TableHead>
						<TableHead>{m.admin_data_reveal_col_hidden()}</TableHead>
						<TableHead>{m.admin_data_reveal_col_reveals()}</TableHead>
						<TableHead>{m.admin_data_reveal_col_last_revealed()}</TableHead>
						<TableHead />
					</TableRow>
				</TableHeader>
				<TableBody>
					{rows.map(row => (
						<TableRow key={row.listId}>
							<TableCell>{row.recipientName}</TableCell>
							<TableCell>
								<div className="flex flex-col">
									<span>{row.listName}</span>
									<span className="text-xs text-muted-foreground">{listTypeLabel(row.listType)}</span>
								</div>
							</TableCell>
							<TableCell>{hiddenLabel(row)}</TableCell>
							<TableCell>{row.scheduledRevealAt ? formatDate(row.scheduledRevealAt) : m.admin_data_reveal_never_manual()}</TableCell>
							<TableCell>{formatDate(row.lastArchivedAt)}</TableCell>
							<TableCell className="text-right">
								<Button
									type="button"
									size="sm"
									variant="outline"
									onClick={() => {
										setSendEmail(false)
										setTarget(row)
									}}
								>
									<Send className="size-4" />
									{m.admin_data_reveal_now_button()}
								</Button>
							</TableCell>
						</TableRow>
					))}
				</TableBody>
			</Table>

			<AlertDialog
				open={target !== null}
				onOpenChange={open => {
					if (!open && !mutation.isPending) setTarget(null)
				}}
			>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>{m.admin_data_reveal_confirm_title({ listName: target?.listName ?? '' })}</AlertDialogTitle>
						<AlertDialogDescription>
							{target?.isOwnList
								? m.admin_data_reveal_confirm_body_own()
								: m.admin_data_reveal_confirm_body_other({ recipientName: target?.recipientName ?? '' })}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="flex items-center gap-2">
						<Checkbox id="reveal-send-email" checked={sendEmail} onCheckedChange={v => setSendEmail(v === true)} />
						<Label htmlFor="reveal-send-email">{m.admin_data_reveal_send_email_label()}</Label>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={mutation.isPending}>{m.action_cancel()}</AlertDialogCancel>
						<AlertDialogAction
							disabled={mutation.isPending}
							onClick={e => {
								e.preventDefault()
								if (target) mutation.mutate(target)
							}}
						>
							{mutation.isPending ? m.admin_data_reveal_busy() : m.admin_data_reveal_confirm()}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
