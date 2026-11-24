import { Lock, ShieldOff } from 'lucide-react'
import type { ReactNode } from 'react'

import type { AdminExchangeMember } from '@/api/_gift-exchanges-impl'
import UserAvatar from '@/components/common/user-avatar'
import { TapTooltip, TapTooltipContent, TapTooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

import { type ExchangeModel, pairKey } from './gift-exchange-model'
import { lockedReasonText, memberName } from './gift-exchange-text'

type CellKind = 'self' | 'can' | 'off' | 'locked'

// The permissions matrix's cell colours: Off reads like its denied cells.
function cellClasses(kind: CellKind): string {
	switch (kind) {
		case 'self':
			return 'bg-muted text-muted-foreground'
		case 'can':
			return 'text-muted-foreground'
		case 'off':
			return 'bg-red-500/15 text-red-700 dark:text-red-400'
		case 'locked':
			return 'bg-amber-500/15 text-amber-700 dark:text-amber-400'
	}
}

function CellGlyph({ kind }: { kind: CellKind }) {
	switch (kind) {
		case 'self':
			return <span className="text-3xs font-semibold text-muted-foreground">{m.admin_perms_glyph_self()}</span>
		case 'can':
			return <span className="size-1.5 rounded-full bg-current opacity-60" />
		case 'off':
			return <ShieldOff className="size-3.5" />
		case 'locked':
			return <Lock className="size-3.5" />
	}
}

/**
 * Who Can Gift to Whom: rows are givers, columns are recipients, laid out
 * like the permissions matrix. Picking a name in either header opens that
 * person's Yes / No dialog. Scrolls sideways on a phone.
 */
export function GiftExchangeMatrix({
	members,
	model,
	onPick,
}: {
	members: ReadonlyArray<AdminExchangeMember>
	model: ExchangeModel
	onPick: (memberId: string) => void
}) {
	const kindOf = (giver: string, recipient: string): CellKind => {
		if (giver === recipient) return 'self'
		if (model.lockedReason.has(pairKey(giver, recipient))) return 'locked'
		if (model.blocked.has(pairKey(giver, recipient))) return 'off'
		return 'can'
	}
	const tipOf = (giver: AdminExchangeMember, recipient: AdminExchangeMember, kind: CellKind): string => {
		const g = memberName(giver)
		const r = memberName(recipient)
		switch (kind) {
			case 'self':
				return m.admin_exchanges_tip_self()
			case 'can':
				return m.admin_exchanges_tip_can({ giver: g, recipient: r })
			case 'off':
				return m.admin_exchanges_tip_off({ giver: g, recipient: r })
			case 'locked':
				return lockedReasonText(model.lockedReason.get(pairKey(giver.id, recipient.id))!, g, r)
		}
	}

	return (
		<TooltipProvider delayDuration={150}>
			<div className="space-y-4">
				<div className="max-h-[70vh] w-fit max-w-full overflow-auto rounded-md border">
					<table className="border-separate border-spacing-0">
						<thead>
							<tr>
								<th className="sticky top-0 left-0 z-30 border-r border-b bg-card p-2 text-left">
									<div className="flex flex-col text-3xs leading-tight font-semibold text-muted-foreground">
										<span>{m.admin_exchanges_matrix_axis_recipient()}</span>
										<span>{m.admin_exchanges_matrix_axis_giver()}</span>
									</div>
								</th>
								{members.map(recipient => {
									const name = memberName(recipient)
									return (
										<th key={recipient.id} className="sticky top-0 z-20 border-b bg-card align-bottom">
											<button
												type="button"
												onClick={() => onPick(recipient.id)}
												className="flex w-12 flex-col items-center gap-1 px-1 py-2 hover:bg-muted/50"
												title={name}
											>
												<UserAvatar name={name} image={recipient.image} size="small" />
												<span className="w-full truncate text-center text-3xs leading-tight font-medium">{name.split(' ')[0]}</span>
											</button>
										</th>
									)
								})}
							</tr>
						</thead>
						<tbody>
							{members.map(giver => {
								const name = memberName(giver)
								return (
									<tr key={giver.id}>
										<th scope="row" className="sticky left-0 z-10 border-r bg-card p-0 text-left align-middle">
											<button
												type="button"
												onClick={() => onPick(giver.id)}
												className="flex w-full min-w-28 items-center gap-2 py-1.5 pr-3 pl-2 text-left hover:bg-muted/50 sm:min-w-44"
											>
												<UserAvatar name={name} image={giver.image} size="small" />
												<span className="flex min-w-0 flex-col">
													<span className="max-w-40 truncate text-xs font-medium">{name}</span>
													{giver.email && (
														<span className="hidden max-w-40 truncate text-3xs text-muted-foreground sm:block">{giver.email}</span>
													)}
												</span>
											</button>
										</th>
										{members.map(recipient => {
											const kind = kindOf(giver.id, recipient.id)
											return (
												<td key={recipient.id} className="border-b p-0">
													<TapTooltip>
														<TapTooltipTrigger asChild>
															<div className={cn('flex size-12 items-center justify-center', cellClasses(kind))}>
																<CellGlyph kind={kind} />
															</div>
														</TapTooltipTrigger>
														<TapTooltipContent side="top">{tipOf(giver, recipient, kind)}</TapTooltipContent>
													</TapTooltip>
												</td>
											)
										})}
									</tr>
								)
							})}
						</tbody>
					</table>
				</div>
				<div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
					<LegendItem kind="can" label={m.admin_exchanges_legend_can()} hint={m.admin_exchanges_legend_can_hint()} />
					<LegendItem kind="off" label={m.admin_exchanges_legend_off()} hint={m.admin_exchanges_legend_off_hint()} />
					<LegendItem kind="locked" label={m.admin_exchanges_legend_locked()} hint={m.admin_exchanges_legend_locked_hint()} />
				</div>
			</div>
		</TooltipProvider>
	)
}

function LegendItem({ kind, label, hint }: { kind: CellKind; label: string; hint: ReactNode }) {
	return (
		<div className="flex items-center gap-1.5">
			<div className={cn('flex size-6 items-center justify-center rounded-sm', cellClasses(kind))}>
				<CellGlyph kind={kind} />
			</div>
			<span className="font-medium text-foreground">{label}</span>
			<span>{hint}</span>
		</div>
	)
}
