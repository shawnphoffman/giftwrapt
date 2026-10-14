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
import { ListTypes } from '@/db/schema/enums'

const hiddenPurchasesQueryKey = ['admin', 'hidden-purchases'] as const

const REVEAL_ERROR_COPY: Record<string, string> = {
	'not-found': 'That list no longer exists or is archived.',
	'not-applicable': "This list type isn't revealed from here.",
	'own-list': "You can't reveal a list you're the recipient of.",
}

// Scheduled reveal dates are calendar dates (UTC midnight) unless the list is
// extended; either way the date is what matters here, so format in UTC.
function formatDate(iso: string | null): string {
	if (!iso) return '-'
	return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
}

function hiddenLabel(row: HiddenPurchasesListRow): string {
	const parts: Array<string> = []
	if (row.hiddenItemCount > 0) parts.push(`${row.hiddenItemCount} claimed`)
	if (row.hiddenAddonCount > 0) parts.push(`${row.hiddenAddonCount} off-list`)
	return parts.join(', ')
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
				toast.success('Gifts revealed', {
					description: `${res.updated} item(s) and ${res.addonsArchived} off-list gift(s) revealed${res.emailSent ? ', email sent' : ''}.`,
				})
				setTarget(null)
				await queryClient.invalidateQueries({ queryKey: hiddenPurchasesQueryKey })
			} else {
				toast.error(REVEAL_ERROR_COPY[res.reason] ?? 'Could not reveal gifts.')
			}
		},
		onError: err => toast.error(err instanceof Error ? err.message : 'Could not reveal gifts.'),
	})

	if (isLoading || !rows) return <p className="text-sm text-muted-foreground">Loading…</p>
	if (rows.length === 0) return <p className="text-sm text-muted-foreground">No lists have hidden gifts right now.</p>

	return (
		<>
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Recipient</TableHead>
						<TableHead>List</TableHead>
						<TableHead>Hidden</TableHead>
						<TableHead>Reveals</TableHead>
						<TableHead>Last revealed</TableHead>
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
									<span className="text-xs text-muted-foreground">{ListTypes[row.listType]}</span>
								</div>
							</TableCell>
							<TableCell>{hiddenLabel(row)}</TableCell>
							<TableCell>{row.scheduledRevealAt ? formatDate(row.scheduledRevealAt) : 'Never (manual)'}</TableCell>
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
									Reveal now
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
						<AlertDialogTitle>Reveal gifts on {target?.listName}?</AlertDialogTitle>
						<AlertDialogDescription>
							Every claimed item and off-list gift still hidden on this list becomes visible to {target?.recipientName} on their Received
							Gifts page, along with who gave it. Use this for gifts that were already given, such as purchases logged after the fact. This
							can&apos;t be undone in bulk.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<div className="flex items-center gap-2">
						<Checkbox id="reveal-send-email" checked={sendEmail} onCheckedChange={v => setSendEmail(v === true)} />
						<Label htmlFor="reveal-send-email">Send the reveal email (if that occasion&apos;s emails are on)</Label>
					</div>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
						<AlertDialogAction
							disabled={mutation.isPending}
							onClick={e => {
								e.preventDefault()
								if (target) mutation.mutate(target)
							}}
						>
							{mutation.isPending ? 'Revealing…' : 'Reveal'}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</>
	)
}
