import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Shuffle, UserMinus, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminExchangeDetail, AdminExchangeMember } from '@/api/_gift-exchanges-impl'
import { removeGiftExchangeMemberAsAdmin, saveGiftExchangeMemberRulesAsAdmin } from '@/api/gift-exchanges'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import UserAvatar from '@/components/common/user-avatar'
import UserTypeBadge from '@/components/common/user-type-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { TapTooltip, TapTooltipContent, TapTooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import type { LockedReason } from '@/lib/gift-exchange/rules'
import { m } from '@/paraglide/messages.js'

import { GIFT_EXCHANGES_QUERY_KEY } from './gift-exchange-details-dialog'
import { buildExchangeModel, pairKey } from './gift-exchange-model'
import { lockedReasonText, memberName, memberShortName, problemText, refusalMessage } from './gift-exchange-text'

/**
 * The Yes / No dialog for one person: for each other person, "Can {name}
 * gift to them?" and "Can they gift to {name}?". A pair a fixed limit forbids
 * is a disabled No with the reason. After the draw, saving redraws for
 * everyone (asked first), and a change that would make the draw impossible
 * can't be saved. The table and outline toggle group of the permissions
 * editor, with the destructive tint of the table's Off cells for No.
 */
export function GiftExchangeRulesDialog({
	exchange,
	memberId,
	onOpenChange,
}: {
	exchange: AdminExchangeDetail
	/** The person being edited; null closes the dialog. */
	memberId: string | null
	onOpenChange: (open: boolean) => void
}) {
	const queryClient = useQueryClient()
	const member = exchange.members.find(x => x.id === memberId)
	const drawn = exchange.state === 'drawn'
	const nameById = useMemo(() => new Map(exchange.members.map(x => [x.id, memberName(x)])), [exchange.members])
	const nameOf = (id: string) => nameById.get(id) ?? m.admin_exchanges_deleted_user()

	const initialBlocks = useMemo(() => {
		const set = new Set<string>()
		if (!memberId) return set
		for (const p of exchange.blocked) {
			if (p.giverMemberId === memberId || p.recipientMemberId === memberId) set.add(pairKey(p.giverMemberId, p.recipientMemberId))
		}
		return set
	}, [exchange.blocked, memberId])
	const [blocks, setBlocks] = useState<Set<string>>(initialBlocks)
	const [confirmSaveOpen, setConfirmSaveOpen] = useState(false)
	const [confirmRemoveOpen, setConfirmRemoveOpen] = useState(false)
	const [confirmRemoveRedraw, setConfirmRemoveRedraw] = useState<{ anyoneHasLooked: boolean } | null>(null)

	useEffect(() => {
		setBlocks(new Set(initialBlocks))
	}, [initialBlocks])

	const draftModel = useMemo(() => (memberId ? buildExchangeModel(exchange, { memberId, blocks }) : null), [exchange, memberId, blocks])
	const dirty = blocks.size !== initialBlocks.size || [...blocks].some(k => !initialBlocks.has(k))
	const problem = draftModel && !draftModel.check.ok ? problemText(draftModel.check, nameOf) : null
	// After the draw a change that leaves no valid draw can't be saved.
	const blockedByProblem = drawn && draftModel !== null && !draftModel.check.ok

	const invalidate = () => queryClient.invalidateQueries({ queryKey: GIFT_EXCHANGES_QUERY_KEY })

	const saveMutation = useMutation({
		mutationFn: (confirmRedraw: boolean) => {
			const pairs = [...blocks].map(k => {
				const [giverMemberId, recipientMemberId] = k.split(':')
				return { giverMemberId, recipientMemberId }
			})
			return saveGiftExchangeMemberRulesAsAdmin({ data: { exchangeId: exchange.id, memberId: memberId!, blocks: pairs, confirmRedraw } })
		},
	})

	const removeMutation = useMutation({
		mutationFn: (confirmRedraw: boolean) =>
			removeGiftExchangeMemberAsAdmin({ data: { exchangeId: exchange.id, memberId: memberId!, confirmRedraw } }),
	})

	const save = async (confirmRedraw: boolean) => {
		try {
			const result = await saveMutation.mutateAsync(confirmRedraw)
			if (result.kind === 'error') {
				const msg = refusalMessage(result, nameOf)
				toast.error(msg.title, { description: msg.description })
				return
			}
			toast.success(result.redrew ? m.admin_exchanges_rules_saved_redrawn_toast() : m.admin_exchanges_rules_saved_toast())
			invalidate()
			onOpenChange(false)
		} catch {
			toast.error(m.admin_exchanges_action_failed())
		}
	}

	const remove = async (confirmRedraw: boolean) => {
		const name = memberName(member)
		try {
			const result = await removeMutation.mutateAsync(confirmRedraw)
			if (result.kind === 'needs-redraw') {
				setConfirmRemoveRedraw({ anyoneHasLooked: result.anyoneHasLooked })
				return
			}
			if (result.kind === 'error') {
				const msg = refusalMessage(result, nameOf)
				toast.error(msg.title, { description: msg.description })
				return
			}
			toast.success(m.admin_exchanges_removed_toast({ name }))
			invalidate()
			onOpenChange(false)
		} catch {
			toast.error(m.admin_exchanges_action_failed())
		}
	}

	const busy = saveMutation.isPending || removeMutation.isPending
	const others = exchange.members.filter(x => x.id !== memberId)
	const name = memberName(member)

	const setPair = (giver: string, recipient: string, yes: boolean) =>
		setBlocks(prev => {
			const next = new Set(prev)
			if (yes) next.delete(pairKey(giver, recipient))
			else next.add(pairKey(giver, recipient))
			return next
		})

	return (
		<>
			<Dialog open={memberId !== null && member !== undefined} onOpenChange={onOpenChange}>
				{/* The content is a column whose table scrolls on its own, with no
				    padding above the pinned headers, so no row shows above them. */}
				<DialogContent className="flex max-h-[calc(100svh-2rem)] flex-col gap-4 overflow-hidden sm:max-w-2xl">
					<DialogHeader className="pr-10">
						<DialogTitle className="flex min-w-0 items-center gap-3">
							{member && <UserAvatar name={name} image={member.image} />}
							<span className="min-w-0 truncate">{name}</span>
							{member?.role && <UserTypeBadge user={{ role: member.role }} />}
						</DialogTitle>
						{drawn && <DialogDescription>{m.admin_exchanges_rules_drawn_note()}</DialogDescription>}
					</DialogHeader>

					{problem && (
						<Alert variant="warning">
							<AlertTriangle />
							<AlertTitle>{problem.title}</AlertTitle>
							<AlertDescription>{problem.sentences.join(' ')}</AlertDescription>
						</Alert>
					)}

					{others.length === 0 ? (
						<p className="text-sm text-muted-foreground">{m.admin_exchanges_rules_empty()}</p>
					) : (
						<TooltipProvider delayDuration={150}>
							<div className="min-h-0 flex-1 overflow-y-auto rounded-lg border">
								<div className="grid grid-cols-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
									<div className="sticky top-0 z-10 hidden items-end border-b bg-muted px-3 py-2 text-xs font-medium tracking-wide text-muted-foreground uppercase sm:flex">
										{m.admin_exchanges_rules_person_column()}
									</div>
									<ColumnHeader member={member} direction="gives" name={name} />
									<ColumnHeader member={member} direction="receives" name={name} />
									{others.map(other => {
										const otherName = memberName(other)
										const givesLocked = draftModel?.lockedReason.get(pairKey(memberId!, other.id))
										const receivesLocked = draftModel?.lockedReason.get(pairKey(other.id, memberId!))
										// Short names, the same ones the column headers use.
										const shortName = memberShortName(member)
										const otherShortName = memberShortName(other)
										const givesReason = givesLocked && lockedReasonText(givesLocked, shortName, otherShortName)
										const receivesReason = receivesLocked && lockedReasonText(receivesLocked, otherShortName, shortName)
										const reasons = [givesReason, receivesReason].filter((r): r is string => Boolean(r))
										return (
											<div key={other.id} className="contents">
												<div className="col-span-2 flex min-w-0 items-center gap-2 border-t px-3 pt-3 sm:col-span-1 sm:py-3">
													<UserAvatar name={otherName} image={other.image} size="small" />
													<div className="min-w-0">
														<div className="truncate text-sm font-medium">{otherName}</div>
														{reasons.map(r => (
															<div key={r} className="text-xs text-muted-foreground">
																{r}
															</div>
														))}
													</div>
												</div>
												<div className="flex justify-center px-3 py-2 sm:border-t sm:py-3">
													<YesNo
														yes={!givesLocked && !blocks.has(pairKey(memberId!, other.id))}
														locked={givesLocked}
														lockedText={givesReason}
														label={m.admin_exchanges_rules_pair_aria({ giver: name, recipient: otherName })}
														disabled={busy}
														onChange={yes => setPair(memberId!, other.id, yes)}
													/>
												</div>
												<div className="flex justify-center px-3 py-2 sm:border-t sm:py-3">
													<YesNo
														yes={!receivesLocked && !blocks.has(pairKey(other.id, memberId!))}
														locked={receivesLocked}
														lockedText={receivesReason}
														label={m.admin_exchanges_rules_pair_aria({ giver: otherName, recipient: name })}
														disabled={busy}
														onChange={yes => setPair(other.id, memberId!, yes)}
													/>
												</div>
											</div>
										)
									})}
								</div>
							</div>
						</TooltipProvider>
					)}

					<DialogFooter className="sm:items-center sm:justify-between">
						{drawn ? (
							<Button
								type="button"
								variant="outline"
								className="text-destructive hover:bg-destructive/10 hover:text-destructive"
								onClick={() => setConfirmRemoveOpen(true)}
								disabled={busy}
							>
								<UserMinus className="size-4" />
								{m.action_remove()}
							</Button>
						) : (
							<span className="hidden sm:block" />
						)}
						<div className="flex flex-col-reverse gap-2 sm:flex-row">
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
								{m.action_cancel()}
							</Button>
							<Button
								type="button"
								disabled={!dirty || busy || blockedByProblem}
								onClick={() => (drawn ? setConfirmSaveOpen(true) : void save(false))}
							>
								{drawn && <Shuffle className="size-4" />}
								{drawn ? m.admin_exchanges_rules_save_and_redraw() : busy ? m.state_saving() : m.action_save()}
							</Button>
						</div>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<ConfirmDialog
				open={confirmSaveOpen}
				onOpenChange={setConfirmSaveOpen}
				title={m.admin_exchanges_redraw_title()}
				description={exchange.anyoneHasLooked ? m.admin_exchanges_redraw_body_looked() : m.admin_exchanges_redraw_body()}
				confirmLabel={m.admin_exchanges_rules_save_and_redraw()}
				onConfirm={() => save(true)}
			/>
			<ConfirmDialog
				open={confirmRemoveOpen}
				onOpenChange={setConfirmRemoveOpen}
				title={m.admin_exchanges_remove_title({ name })}
				description={m.admin_exchanges_remove_body_drawn({ name })}
				confirmLabel={m.action_remove()}
				destructive
				onConfirm={() => remove(false)}
			/>
			<ConfirmDialog
				open={confirmRemoveRedraw !== null}
				onOpenChange={open => !open && setConfirmRemoveRedraw(null)}
				title={m.admin_exchanges_remove_redraw_title({ name })}
				description={
					<>
						{m.admin_exchanges_remove_redraw_body({ name })}{' '}
						{confirmRemoveRedraw?.anyoneHasLooked ? m.admin_exchanges_redraw_body_looked() : m.admin_exchanges_redraw_body()}
					</>
				}
				confirmLabel={m.admin_exchanges_remove_and_redraw()}
				destructive
				onConfirm={() => remove(true)}
			/>
		</>
	)
}

// "Can Nora gift to them?" with a small picture: Nora, an arrow, them.
function ColumnHeader({
	member,
	direction,
	name,
}: {
	member: AdminExchangeMember | undefined
	direction: 'gives' | 'receives'
	name: string
}) {
	// First name only, as in the table's column headers, so the two short
	// questions fit side by side on a phone.
	const firstName = name.split(' ')[0]
	const person = <UserAvatar name={name} image={member?.image} size="small" className="size-5" />
	const them = (
		<span className="inline-flex size-5 items-center justify-center rounded-full bg-muted-foreground/20">
			<Users className="size-3" />
		</span>
	)
	return (
		<div className="sticky top-0 z-10 flex flex-col items-center justify-end gap-1 border-b bg-muted px-3 py-2 text-center text-xs font-medium text-muted-foreground">
			<span className="flex items-center gap-1" aria-hidden>
				{direction === 'gives' ? person : them}
				<ArrowRight className="size-3" />
				{direction === 'gives' ? them : person}
			</span>
			<span className="max-w-36 leading-tight">
				{direction === 'gives'
					? m.admin_exchanges_rules_gives_column({ name: firstName })
					: m.admin_exchanges_rules_receives_column({ name: firstName })}
			</span>
		</div>
	)
}

function YesNo({
	yes,
	locked,
	lockedText,
	label,
	disabled,
	onChange,
}: {
	yes: boolean
	locked: LockedReason | undefined
	lockedText: string | undefined
	label: string
	disabled: boolean
	onChange: (yes: boolean) => void
}) {
	const group = (
		<ToggleGroup
			type="single"
			variant="outline"
			size="sm"
			value={yes ? 'yes' : 'no'}
			onValueChange={v => {
				if (v) onChange(v === 'yes')
			}}
			disabled={disabled || locked !== undefined}
			aria-label={label}
		>
			<ToggleGroupItem
				value="yes"
				className="data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:hover:bg-primary data-[state=on]:hover:text-primary-foreground"
			>
				{m.word_yes()}
			</ToggleGroupItem>
			<ToggleGroupItem
				value="no"
				className="data-[state=on]:bg-red-500/15 data-[state=on]:text-red-700 data-[state=on]:hover:bg-red-500/15 dark:data-[state=on]:text-red-400"
			>
				{m.word_no()}
			</ToggleGroupItem>
		</ToggleGroup>
	)
	if (!locked) return group
	return (
		<TapTooltip>
			<TapTooltipTrigger asChild>
				<span className="inline-flex" tabIndex={0}>
					{group}
				</span>
			</TapTooltipTrigger>
			<TapTooltipContent>{lockedText}</TapTooltipContent>
		</TapTooltip>
	)
}
