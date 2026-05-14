// Per-list alert surface for items the recipient has deleted while the
// caller (or their partner) has an active claim. Renders above the
// filters and below the list description on the list-detail page. Each
// row is a truncated card (title, image, claim info, ack button).

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Loader2, PackageX } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { acknowledgeOrphanedClaim, getOrphanedClaimsForList, type OrphanedClaimRow } from '@/api/orphan-claims'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

const orphanQueryKey = (listId: number) => ['orphan-claims', 'list', listId] as const

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
				toast.error('Could not acknowledge', { description: result.reason })
				return
			}
			toast.success(result.itemDeleted ? 'Item cleared from your view.' : 'Acknowledged.')
			queryClient.invalidateQueries({ queryKey: orphanQueryKey(listId) })
			queryClient.invalidateQueries({ queryKey: ['orphan-claims', 'summary'] })
			queryClient.invalidateQueries({ queryKey: ['items', listId] })
			queryClient.invalidateQueries({ queryKey: ['purchases'] })
		},
		onError: () => toast.error('Something went wrong. Try again.'),
	})

	if (!data || data.length === 0) return null

	return (
		<Alert variant="destructive" className="border-destructive/40">
			<PackageX />
			<AlertTitle>The recipient removed an item you claimed</AlertTitle>
			<AlertDescription>
				<p>
					The item below was already in your purchases. The recipient was never told you claimed it, so they don&apos;t know that you may
					have already bought it. You may want to return it, hold onto it, or give it anyway. Acknowledge to clear it from your view.
				</p>
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
	const cost = row.totalCost ? `$${row.totalCost}` : null
	return (
		<div className="flex flex-row items-center gap-3 rounded-md border border-destructive/30 bg-background/60 p-3">
			{row.itemImageUrl ? (
				<img src={row.itemImageUrl} alt="" className="size-14 rounded object-cover shrink-0" loading="lazy" />
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
							aria-label="Open original product link"
						>
							<ExternalLink className="size-3.5" />
						</a>
					)}
				</div>
				<div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{row.quantity > 1 && <span className="tabular-nums">Qty {row.quantity}</span>}
					{cost && <span className="tabular-nums">{cost}</span>}
					{row.isPartnerPurchase && <span className="italic">Claimed by your partner</span>}
				</div>
			</div>
			<Button
				size="sm"
				variant="outline"
				className="shrink-0"
				onClick={onAck}
				disabled={pending}
				aria-label={`Acknowledge removal of ${row.itemTitle}`}
			>
				{pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
				Acknowledge
			</Button>
		</div>
	)
}
