import { Eye, Gift, Shuffle } from 'lucide-react'
import { useState } from 'react'

import type { ExchangeRecipientRef, MyChildExchange, MyExchange, MyExchangesPayload } from '@/api/_my-gift-exchanges-impl'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import { PageHeading } from '@/components/common/page-heading'
import UserAvatar from '@/components/common/user-avatar'
import ListsForUser from '@/components/lists/lists-for-user'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { m } from '@/paraglide/messages.js'

import { exchangeLine } from './gift-exchange-text'

type Props = {
	data: MyExchangesPayload
	/** See Who You Have. Resolves once the page has the person (the caller refetches). */
	onReveal: (exchangeId: string) => Promise<void>
	/** A guardian's Show. Resolves to who the child gifts to, or null when it was refused (the caller says why). */
	onRevealChild: (exchangeId: string, childUserId: string) => Promise<ExchangeRecipientRef | null>
}

/**
 * Everyone's Gift Exchange page: one block per drawn, unarchived exchange the
 * person is in (a card with the name, budget and date, then See Who You Have
 * until they look, then the same person card All Lists uses), and a Children
 * card for a guardian. Rendering this page never counts as looking.
 */
export function GiftExchangeMemberPage({ data, onReveal, onRevealChild }: Props) {
	const empty = data.exchanges.length === 0 && data.children.length === 0
	return (
		<div className="wish-page">
			<div className="flex flex-col flex-1 gap-6">
				<PageHeading title={m.exchanges_heading()} icon={Gift} color="red" />
				{empty && (
					<div className="text-sm text-muted-foreground py-3 px-3 border border-dashed rounded-lg bg-accent/30">{m.exchanges_empty()}</div>
				)}
				{data.exchanges.map(exchange => (
					<ExchangeBlock key={exchange.id} exchange={exchange} onReveal={onReveal} />
				))}
				{data.children.length > 0 && <ChildrenCard rows={data.children} onRevealChild={onRevealChild} />}
			</div>
		</div>
	)
}

function ExchangeBlock({ exchange, onReveal }: { exchange: MyExchange; onReveal: Props['onReveal'] }) {
	const [busy, setBusy] = useState(false)
	const seen = exchange.state === 'seen' && exchange.recipient !== null
	const reveal = async () => {
		setBusy(true)
		try {
			await onReveal(exchange.id)
		} finally {
			setBusy(false)
		}
	}
	return (
		<section aria-label={exchange.name} className="flex flex-col gap-6">
			{exchange.state === 'changed' && (
				<Alert variant="warning">
					<Shuffle />
					<AlertTitle>{m.exchanges_changed_title()}</AlertTitle>
					<AlertDescription>{m.exchanges_changed_body()}</AlertDescription>
				</Alert>
			)}
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl min-w-0 [overflow-wrap:anywhere]">{exchange.name}</CardTitle>
					<CardDescription>{exchangeLine(exchange, seen)}</CardDescription>
				</CardHeader>
				{!seen && (
					<CardContent className="space-y-4">
						<p className="text-sm text-muted-foreground">{m.exchanges_drawn()}</p>
						<Button onClick={() => void reveal()} disabled={busy}>
							<Gift />
							{m.exchanges_see_button()}
						</Button>
					</CardContent>
				)}
			</Card>
			{seen && exchange.recipient && <ListsForUser user={exchange.recipient} />}
		</section>
	)
}

function childName(child: MyChildExchange['child']): string {
	return child.name || child.email
}

function ChildrenCard({ rows, onRevealChild }: { rows: Array<MyChildExchange>; onRevealChild: Props['onRevealChild'] }) {
	const [confirming, setConfirming] = useState<MyChildExchange | null>(null)
	const [result, setResult] = useState<{ row: MyChildExchange; recipient: ExchangeRecipientRef } | null>(null)

	const show = async () => {
		if (!confirming) return
		const row = confirming
		const recipient = await onRevealChild(row.exchangeId, row.child.id)
		if (recipient) setResult({ row, recipient })
	}

	return (
		<>
			<Card>
				<CardHeader>
					<CardTitle className="text-2xl">{m.exchanges_children_title()}</CardTitle>
					<CardDescription>{m.exchanges_children_description()}</CardDescription>
				</CardHeader>
				<CardContent>
					<ul className="divide-y rounded-md border">
						{rows.map(row => {
							const name = childName(row.child)
							return (
								<li key={`${row.exchangeId}:${row.child.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3">
									<div className="flex items-center gap-3 min-w-0">
										<UserAvatar name={name} image={row.child.image} size="small" />
										<div className="min-w-0">
											<div className="text-sm font-medium truncate">{name}</div>
											<div className="text-xs text-muted-foreground truncate">{row.exchangeName}</div>
										</div>
									</div>
									<Button variant="outline" size="sm" onClick={() => setConfirming(row)}>
										<Eye />
										{m.exchanges_show_button()}
									</Button>
								</li>
							)
						})}
					</ul>
				</CardContent>
			</Card>

			<ConfirmDialog
				open={confirming !== null}
				onOpenChange={open => !open && setConfirming(null)}
				title={confirming ? m.exchanges_child_confirm_title({ name: childName(confirming.child) }) : ''}
				description={confirming ? m.exchanges_child_confirm_body({ name: childName(confirming.child) }) : undefined}
				confirmLabel={m.exchanges_show_button()}
				onConfirm={show}
			/>

			<Dialog open={result !== null} onOpenChange={open => !open && setResult(null)}>
				<DialogContent aria-describedby={undefined}>
					<DialogHeader>
						<DialogTitle className="text-2xl pr-8 [overflow-wrap:anywhere]">
							{result ? m.exchanges_child_result_title({ name: childName(result.row.child) }) : ''}
						</DialogTitle>
					</DialogHeader>
					{result && (
						<div className="flex items-center gap-3 min-w-0">
							<UserAvatar name={result.recipient.name || result.recipient.email} image={result.recipient.image} />
							<span className="text-xl font-semibold min-w-0 [overflow-wrap:anywhere]">
								{result.recipient.name || result.recipient.email}
							</span>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	)
}
