import { ClientOnly, createFileRoute, useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { Suspense, useState } from 'react'

import { GiftExchangeDetailsDialog } from '@/components/admin/gift-exchange-details-dialog'
import { AdminGiftExchangesList } from '@/components/admin/gift-exchanges-list'
import LoadingSkeleton from '@/components/skeletons/loading-skeleton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { m } from '@/paraglide/messages.js'
import { pageHead } from '@/routes/-head'

export const Route = createFileRoute('/(core)/admin/exchanges/')({
	head: pageHead(() => m.page_exchanges()),
	component: AdminExchangesPage,
})

function AdminExchangesPage() {
	const navigate = useNavigate()
	const [addOpen, setAddOpen] = useState(false)

	return (
		<>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<div className="flex items-center justify-between gap-4">
						<CardTitle className="text-2xl">{m.admin_exchanges_title()}</CardTitle>
						<Button onClick={() => setAddOpen(true)} size="sm">
							<Plus className="size-4" /> {m.admin_exchanges_add()}
						</Button>
					</div>
					<CardDescription>{m.admin_exchanges_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<Suspense fallback={<LoadingSkeleton />}>
						<ClientOnly>
							<AdminGiftExchangesList />
						</ClientOnly>
					</Suspense>
				</CardContent>
			</Card>

			<ClientOnly>
				<GiftExchangeDetailsDialog
					open={addOpen}
					onOpenChange={setAddOpen}
					onCreated={id => void navigate({ to: '/admin/exchanges/$exchangeId', params: { exchangeId: id } })}
				/>
			</ClientOnly>
		</>
	)
}
