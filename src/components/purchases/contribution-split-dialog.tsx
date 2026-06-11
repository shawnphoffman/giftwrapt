import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { DollarSign } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { getContributionSplit, setContributionSplit } from '@/api/gifts'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { parseTotalCost } from '@/lib/contributions'

type Props = {
	open: boolean
	onOpenChange: (open: boolean) => void
	giftId: number
	itemTitle: string
}

const VALID_AMOUNT = /^\d+(\.\d{1,2})?$/

// Residual-style split editor: the primary (or their partner) sets each
// co-gifter's amount; the primary's share is whatever's left. Always-valid by
// construction - the only failure is over-allocating past the total. Reset to
// even clears the custom split.
export function ContributionSplitDialog({ open, onOpenChange, giftId, itemTitle }: Props) {
	const router = useRouter()
	const queryClient = useQueryClient()
	const [amounts, setAmounts] = useState<Record<string, string>>({})
	const [saving, setSaving] = useState(false)
	const [error, setError] = useState<string | null>(null)

	const { data: split } = useQuery({
		queryKey: ['contribution-split', giftId],
		queryFn: () => getContributionSplit({ data: { giftId } }),
		enabled: open,
		staleTime: 0,
	})

	useEffect(() => {
		if (split) setAmounts(Object.fromEntries(split.coGifters.map(c => [c.id, c.amount])))
	}, [split])

	const total = parseTotalCost(split?.totalCost ?? null)
	const sumCo = Object.values(amounts).reduce((s, v) => s + (parseTotalCost(v) ?? 0), 0)
	const residual = total != null ? Math.round((total - sumCo) * 100) / 100 : null
	const overAllocated = residual != null && residual < -0.001
	const anyInvalid = Object.values(amounts).some(v => v.trim() !== '' && !VALID_AMOUNT.test(v.trim()))

	const refresh = () => {
		router.invalidate()
		queryClient.invalidateQueries({ queryKey: ['contribution-split', giftId] })
	}

	const save = async (coGifters: Array<{ userId: string; amount: string }>) => {
		setSaving(true)
		setError(null)
		try {
			const result = await setContributionSplit({ data: { giftId, coGifters } })
			if (result.kind === 'ok') {
				toast.success('Split updated')
				refresh()
				onOpenChange(false)
				return
			}
			setError(
				result.reason === 'exceeds-total'
					? "The co-gifters' shares add up to more than the total."
					: result.reason === 'no-cost'
						? 'Add a total cost to this gift before splitting it.'
						: "You can't edit this split."
			)
		} catch {
			setError('Failed to update the split.')
		} finally {
			setSaving(false)
		}
	}

	const onSave = () => {
		if (!split) return
		save(split.coGifters.map(c => ({ userId: c.id, amount: (amounts[c.id] ?? '').trim() || '0' })))
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle className="text-base line-clamp-2 leading-snug">Split “{itemTitle}”</DialogTitle>
					<DialogDescription>
						Set what each co-gifter put in. Your share is whatever&rsquo;s left. Only you and your partner see this.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-3">
					{split?.coGifters.map(c => (
						<div key={c.id} className="grid gap-1.5">
							<Label htmlFor={`co-${c.id}`}>{c.name || c.email}</Label>
							<div className="relative">
								<DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
								<Input
									id={`co-${c.id}`}
									inputMode="decimal"
									value={amounts[c.id] ?? ''}
									onChange={e => setAmounts(prev => ({ ...prev, [c.id]: e.target.value }))}
									disabled={saving}
									className="pl-8"
								/>
							</div>
						</div>
					))}

					<div className="flex items-center justify-between border-t pt-3 text-sm">
						<span className="font-medium">Your share</span>
						<span className={`tabular-nums font-semibold ${overAllocated ? 'text-destructive' : ''}`}>
							{residual != null ? `$${residual.toFixed(2)}` : '-'}
						</span>
					</div>
					{overAllocated && (
						<Alert variant="destructive">
							<AlertDescription>
								The co-gifters&rsquo; shares exceed the total. Lower them so your share isn&rsquo;t negative.
							</AlertDescription>
						</Alert>
					)}
					{error && (
						<Alert variant="destructive">
							<AlertDescription>{error}</AlertDescription>
						</Alert>
					)}
				</div>

				<DialogFooter className="flex-col-reverse gap-2 sm:flex-row sm:justify-between">
					<Button type="button" variant="outline" onClick={() => save([])} disabled={saving}>
						Reset to even
					</Button>
					<div className="flex gap-2 sm:justify-end">
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
							Cancel
						</Button>
						<Button type="button" onClick={onSave} disabled={saving || overAllocated || anyInvalid}>
							{saving ? 'Saving…' : 'Save'}
						</Button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
