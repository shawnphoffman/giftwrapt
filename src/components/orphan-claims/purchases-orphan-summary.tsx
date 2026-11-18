// Lighter alert for the /purchases page. Lists each list with at least
// one orphan claim involving the caller (or their partner) plus a count,
// with a "View on the list" link that takes them to the per-list alert
// where they can ack.

import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { PackageX } from 'lucide-react'

import { getOrphanedClaimsSummary } from '@/api/orphan-claims'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { m } from '@/paraglide/messages.js'

export function PurchasesOrphanSummary() {
	const { data } = useQuery({
		queryKey: ['orphan-claims', 'summary'] as const,
		queryFn: () => getOrphanedClaimsSummary(),
		staleTime: 30_000,
	})

	if (!data || data.length === 0) return null

	return (
		<Alert variant="destructive" className="border-destructive/40">
			<PackageX />
			<AlertTitle>{m.lists_orphan_summary_title()}</AlertTitle>
			<AlertDescription>
				<p>{m.lists_orphan_summary_body()}</p>
				<div className="flex flex-col gap-2">
					{data.map(row => (
						<div
							key={row.listId}
							className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-background/60 px-3 py-2"
						>
							<div className="flex flex-col min-w-0">
								<span className="text-sm font-medium text-foreground truncate">{row.listName}</span>
								<span className="text-xs text-muted-foreground truncate">
									{row.listIsActive
										? m.lists_orphan_summary_row({ count: row.count, recipientName: row.recipientName })
										: m.lists_orphan_summary_row_archived({ count: row.count, recipientName: row.recipientName })}
								</span>
							</div>
							<Button asChild size="sm" variant="outline" className="shrink-0">
								<Link to="/lists/$listId" params={{ listId: String(row.listId) }}>
									{m.lists_orphan_summary_open()}
								</Link>
							</Button>
						</div>
					))}
				</div>
			</AlertDescription>
		</Alert>
	)
}
