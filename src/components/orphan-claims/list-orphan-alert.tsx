// Per-list alert surface for items the recipient has deleted while the
// caller (or their partner) has an active claim. Renders above the
// filters and below the list description on the list-detail page. Each
// row is a truncated card (title, image, claim info, ack button).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Loader2, PackageX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { acknowledgeOrphanedClaim, getOrphanedClaimsForList, type OrphanedClaimRow } from '@/api/orphan-claims'
import { RemoteImage } from '@/components/common/remote-image'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useMoney } from '@/hooks/use-money'
import { m } from '@/paraglide/messages.js'

const orphanQueryKey = (listId: number) => ['orphan-claims', 'list', listId] as const

function orphanAckErrorText(reason: 'not-found' | 'not-yours' | 'not-pending-deletion'): string {
	switch (reason) {
		case 'not-found':
			return m.lists_orphan_ack_error_not_found()
		case 'not-yours':
			return m.lists_orphan_ack_error_not_yours()
		case 'not-pending-deletion':
			return m.lists_orphan_ack_error_not_pending()
	}
}

export function ListOrphanAlert({ listId }: { listId: number }) {
	const queryClient = useQueryClient()
	const { data } = useQuery({
		queryKey: orphanQueryKey(listId),
		queryFn: () => getOrphanedClaimsForList({ data: { listId } }),
		staleTime: 30_000,
	})
	const [pendingId, setPendingId] = useState<number | null>(null)

	const ackMutation = useMutation({
		mutationFn: (giftId: number) => acknowledgeOrphanedClaim({ data: { giftId } }),
		onMutate: giftId => setPendingId(giftId),
		onSettled: () => setPendingId(null),
		onSuccess: result => {
			if (result.kind === 'error') {
				toast.error(m.lists_orphan_ack_failed(), { description: orphanAckErrorText(result.reason) })
				return
			}
			toast.success(result.itemDeleted ? m.lists_orphan_ack_cleared() : m.lists_orphan_acknowledged())
			queryClient.invalidateQueries({ queryKey: orphanQueryKey(listId) })
			queryClient.invalidateQueries({ queryKey: ['orphan-claims', 'summary'] })
			queryClient.invalidateQueries({ queryKey: ['items', listId] })
			queryClient.invalidateQueries({ queryKey: ['purchases'] })
		},
		onError: () => toast.error(m.lists_orphan_ack_error()),
	})

	if (!data || data.length === 0) return null

	return (
		<Alert variant="destructive" className="border-destructive/40">
			<PackageX />
			<AlertTitle>{m.lists_orphan_alert_title()}</AlertTitle>
			<AlertDescription>
				<p>{m.lists_orphan_alert_body()}</p>
				<div className="flex flex-col gap-2">
					{data.map(row => (
						<OrphanRow
							key={row.giftId}
							row={row}
							pending={ackMutation.isPending && pendingId === row.giftId}
							onAck={() => ackMutation.mutate(row.giftId)}
						/>
					))}
				</div>
			</AlertDescription>
		</Alert>
	)
}

function OrphanRow({ row, pending, onAck }: { row: OrphanedClaimRow; pending: boolean; onAck: () => void }) {
	const money = useMoney()
	const cost = row.totalCost ? money.itemPrice(row.totalCost) : null
	return (
		<div className="flex flex-row items-center gap-3 rounded-md border border-destructive/30 bg-background/60 p-3">
			{row.itemImageUrl ? (
				<RemoteImage src={row.itemImageUrl} alt="" className="size-14 rounded object-cover shrink-0" loading="lazy" />
			) : (
				<div className="size-14 rounded bg-muted shrink-0" aria-hidden />
			)}
			<div className="flex flex-1 min-w-0 flex-col gap-0.5">
				<div className="flex items-center gap-1.5 min-w-0">
					<span className="text-sm font-medium text-foreground truncate">{row.itemTitle}</span>
					{row.itemUrl && (
						<a
							href={row.itemUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-muted-foreground hover:text-foreground shrink-0"
							aria-label={m.lists_orphan_open_link_label()}
						>
							<ExternalLink className="size-3.5" />
						</a>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{row.quantity > 1 && <span className="tabular-nums">{m.lists_orphan_quantity({ quantity: row.quantity })}</span>}
					{cost && <span className="tabular-nums">{cost}</span>}
					{row.isPartnerPurchase && <span className="italic">{m.lists_orphan_partner_claim()}</span>}
				</div>
			</div>
			<Button
				size="sm"
				variant="outline"
				className="shrink-0"
				onClick={onAck}
				disabled={pending}
				aria-label={m.lists_orphan_ack_label({ itemTitle: row.itemTitle })}
			>
				{pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
				{m.lists_orphan_ack_button()}
			</Button>
		</div>
	)
}
