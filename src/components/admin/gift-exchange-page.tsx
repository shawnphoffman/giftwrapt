import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { AlertTriangle, Archive, ArrowRight, Ban, Pencil, Shuffle, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import type { AdminExchangeDetail, AdminExchangeMember } from '@/api/_gift-exchanges-impl'
import { getUsersAsAdmin } from '@/api/admin'
import {
	addGiftExchangeMembersAsAdmin,
	archiveGiftExchangeAsAdmin,
	deleteGiftExchangeAsAdmin,
	drawGiftExchangeAsAdmin,
	redrawGiftExchangeAsAdmin,
	removeGiftExchangeMemberAsAdmin,
} from '@/api/gift-exchanges'
import { ConfirmDialog } from '@/components/common/confirm-dialog'
import UserAvatar from '@/components/common/user-avatar'
import UserTypeBadge from '@/components/common/user-type-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { MIN_DRAW_MEMBERS } from '@/lib/gift-exchange/draw'
import { formatDate } from '@/lib/i18n/format'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

import { GIFT_EXCHANGES_QUERY_KEY, GiftExchangeDetailsDialog } from './gift-exchange-details-dialog'
import { GiftExchangeMatrix } from './gift-exchange-matrix'
import { buildExchangeModel, type ExchangeModel, optionCounts } from './gift-exchange-model'
import { GiftExchangePersonPicker, type PickablePerson } from './gift-exchange-person-picker'
import { GiftExchangeRulesDialog } from './gift-exchange-rules-dialog'
import { exchangeMetaLine, memberName, problemText, type RefusalMessage, refusalMessage } from './gift-exchange-text'
import { ExchangeStateBadge } from './gift-exchanges-list'

type AdminUserRow = PickablePerson & { banned: boolean }

type Confirm = 'delete' | 'archive' | 'redraw' | null

/**
 * One exchange as a page of stacked cards, like the Users page: details with
 * the actions, People, and Who Can Gift to Whom. Once archived, the details
 * card and the list of who gifted to whom.
 */
export function GiftExchangePage({ exchange }: { exchange: AdminExchangeDetail }) {
	const queryClient = useQueryClient()
	const navigate = useNavigate()
	const [editOpen, setEditOpen] = useState(false)
	const [confirm, setConfirm] = useState<Confirm>(null)
	const [rulesMemberId, setRulesMemberId] = useState<string | null>(null)

	const model = useMemo(() => buildExchangeModel(exchange), [exchange])
	const nameById = useMemo(() => new Map(exchange.members.map(x => [x.id, memberName(x)])), [exchange.members])
	const nameOf = (id: string) => nameById.get(id) ?? m.admin_exchanges_deleted_user()

	const usersQuery = useQuery({
		queryKey: ['admin', 'users'],
		queryFn: () => getUsersAsAdmin(),
		staleTime: 5 * 60 * 1000,
		enabled: exchange.state !== 'archived',
	})
	const users = (usersQuery.data ?? []) as Array<AdminUserRow>
	const memberUserIds = new Set(exchange.members.map(x => x.userId))
	const addable = users.filter(u => !u.banned && !memberUserIds.has(u.id))
	const userName = (userId: string) => {
		const u = users.find(x => x.id === userId)
		return u ? u.name || u.email : undefined
	}

	const invalidate = () => queryClient.invalidateQueries({ queryKey: GIFT_EXCHANGES_QUERY_KEY })
	const showRefusal = (msg: RefusalMessage) => toast.error(msg.title, { description: msg.description })

	type ActionResult = { kind: string; reason?: string }
	const action = useMutation({
		mutationFn: async (fn: () => Promise<ActionResult>) => fn(),
	})
	const run = async (fn: () => Promise<ActionResult>, success: string, after?: () => void) => {
		try {
			const result = await action.mutateAsync(fn)
			if (result.kind === 'error') {
				showRefusal(refusalMessage(result as Parameters<typeof refusalMessage>[0], nameOf, userName))
				return
			}
			toast.success(success)
			await invalidate()
			after?.()
		} catch {
			toast.error(m.admin_exchanges_action_failed())
		}
	}

	const data = { exchangeId: exchange.id }
	const draw = () => run(() => drawGiftExchangeAsAdmin({ data }), m.admin_exchanges_drawn_toast())
	const redraw = () => run(() => redrawGiftExchangeAsAdmin({ data }), m.admin_exchanges_redrawn_toast())
	const archive = () => run(() => archiveGiftExchangeAsAdmin({ data }), m.admin_exchanges_archived_toast())
	const remove = () =>
		run(
			() => deleteGiftExchangeAsAdmin({ data }),
			m.admin_exchanges_deleted_toast(),
			() => void navigate({ to: '/admin/exchanges' })
		)
	const addPeople = (userIds: Array<string>) =>
		run(
			() => addGiftExchangeMembersAsAdmin({ data: { exchangeId: exchange.id, userIds } }),
			m.admin_exchanges_added_toast({ count: userIds.length })
		)
	const removePerson = (member: AdminExchangeMember) =>
		run(
			() => removeGiftExchangeMemberAsAdmin({ data: { exchangeId: exchange.id, memberId: member.id } }),
			m.admin_exchanges_removed_toast({ name: memberName(member) })
		)

	const busy = action.isPending
	const archived = exchange.state === 'archived'
	const drawn = exchange.state === 'drawn'
	const tooFew = exchange.members.length < MIN_DRAW_MEMBERS
	const problem = !archived && exchange.drawCheck && !exchange.drawCheck.ok ? problemText(exchange.drawCheck, nameOf) : null
	const canDraw = exchange.drawCheck?.ok === true

	return (
		<>
			<Card className="animate-page-in max-w-2xl">
				<CardHeader>
					<div className="flex flex-col gap-3 @lg/admin-content:flex-row @lg/admin-content:items-start @lg/admin-content:justify-between">
						<CardTitle className="min-w-0 text-2xl break-words">{exchange.name}</CardTitle>
						{archived ? (
							<ExchangeStateBadge state="archived" />
						) : (
							<div className="flex shrink-0 flex-wrap items-center gap-2">
								<Button size="sm" variant="outline" onClick={() => setEditOpen(true)} disabled={busy}>
									<Pencil className="size-4" />
									{m.action_edit()}
								</Button>
								{drawn ? (
									<>
										<Button size="sm" variant="outline" onClick={() => setConfirm('archive')} disabled={busy}>
											<Archive className="size-4" />
											{m.admin_exchanges_archive()}
										</Button>
										<Button size="sm" variant="outline" onClick={() => setConfirm('redraw')} disabled={busy || !canDraw}>
											<Shuffle className="size-4" />
											{m.admin_exchanges_redraw()}
										</Button>
									</>
								) : (
									<>
										<Button
											size="sm"
											variant="outline"
											className="text-destructive hover:bg-destructive/10 hover:text-destructive"
											onClick={() => setConfirm('delete')}
											disabled={busy}
										>
											<Trash2 className="size-4" />
											{m.action_delete()}
										</Button>
										<Button size="sm" onClick={() => void draw()} disabled={busy || !canDraw}>
											<Shuffle className="size-4" />
											{m.admin_exchanges_draw()}
										</Button>
									</>
								)}
							</div>
						)}
					</div>
					<CardDescription>{exchangeMetaLine(exchange, exchange.members.length)}</CardDescription>
				</CardHeader>
				{(drawn || (!archived && tooFew) || problem) && (
					<CardContent className="space-y-3">
						{drawn && exchange.drawnAt && (
							<div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
								<ExchangeStateBadge state="drawn" />
								<span>{m.admin_exchanges_drawn_at({ date: formatDate(exchange.drawnAt, { dateStyle: 'medium' }) })}</span>
							</div>
						)}
						{!archived && tooFew && (
							<p className="text-sm text-muted-foreground">{m.admin_exchanges_too_few({ minimum: MIN_DRAW_MEMBERS })}</p>
						)}
						{problem && (
							<Alert variant="warning">
								<AlertTriangle />
								<AlertTitle>{problem.title}</AlertTitle>
								<AlertDescription>
									<p>{problem.sentences.join(' ')}</p>
									<div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
										{problem.memberIds.map(id => (
											<button
												key={id}
												type="button"
												onClick={() => setRulesMemberId(id)}
												className="font-medium text-current underline underline-offset-3"
											>
												{nameOf(id)}
											</button>
										))}
									</div>
								</AlertDescription>
							</Alert>
						)}
					</CardContent>
				)}
			</Card>

			{archived ? (
				<PairingsCard exchange={exchange} nameOf={nameOf} />
			) : (
				<>
					<Card className="animate-page-in max-w-2xl">
						<CardHeader>
							<div className="flex flex-col gap-3 @lg/admin-content:flex-row @lg/admin-content:items-center @lg/admin-content:justify-between">
								<CardTitle className="text-2xl">{m.admin_exchanges_people_title()}</CardTitle>
								<GiftExchangePersonPicker
									people={addable}
									onPick={id => void addPeople([id])}
									onPickEverybody={() => void addPeople(addable.map(u => u.id))}
									disabled={busy}
								/>
							</div>
							<CardDescription>{m.admin_exchanges_people_description()}</CardDescription>
						</CardHeader>
						<CardContent>
							<PeopleList
								members={exchange.members}
								model={model}
								canRemove={!drawn}
								disabled={busy}
								onPick={setRulesMemberId}
								onRemove={member => void removePerson(member)}
							/>
						</CardContent>
					</Card>

					{exchange.members.length > 0 && (
						<Card className="animate-page-in max-w-2xl">
							<CardHeader>
								<CardTitle className="text-2xl">{m.admin_exchanges_matrix_title()}</CardTitle>
								<CardDescription>{m.admin_exchanges_matrix_description()}</CardDescription>
							</CardHeader>
							<CardContent>
								<GiftExchangeMatrix members={exchange.members} model={model} onPick={setRulesMemberId} />
							</CardContent>
						</Card>
					)}
				</>
			)}

			<GiftExchangeDetailsDialog open={editOpen} onOpenChange={setEditOpen} exchange={exchange} />
			{!archived && (
				<GiftExchangeRulesDialog exchange={exchange} memberId={rulesMemberId} onOpenChange={open => !open && setRulesMemberId(null)} />
			)}

			<ConfirmDialog
				open={confirm === 'delete'}
				onOpenChange={open => !open && setConfirm(null)}
				title={m.admin_exchanges_delete_title({ name: exchange.name })}
				description={m.admin_exchanges_delete_body()}
				confirmLabel={m.action_delete()}
				destructive
				onConfirm={remove}
			/>
			<ConfirmDialog
				open={confirm === 'archive'}
				onOpenChange={open => !open && setConfirm(null)}
				title={m.admin_exchanges_archive_title({ name: exchange.name })}
				description={m.admin_exchanges_archive_body()}
				confirmLabel={m.admin_exchanges_archive()}
				onConfirm={archive}
			/>
			<ConfirmDialog
				open={confirm === 'redraw'}
				onOpenChange={open => !open && setConfirm(null)}
				title={m.admin_exchanges_redraw_title()}
				description={exchange.anyoneHasLooked ? m.admin_exchanges_redraw_body_looked() : m.admin_exchanges_redraw_body()}
				confirmLabel={m.admin_exchanges_redraw()}
				onConfirm={redraw}
			/>
		</>
	)
}

function PeopleList({
	members,
	model,
	canRemove,
	disabled,
	onPick,
	onRemove,
}: {
	members: ReadonlyArray<AdminExchangeMember>
	model: ExchangeModel
	canRemove: boolean
	disabled: boolean
	onPick: (memberId: string) => void
	onRemove: (member: AdminExchangeMember) => void
}) {
	if (members.length === 0) return <div className="text-sm text-muted-foreground">{m.admin_exchanges_people_empty()}</div>
	return (
		<div className="grid grid-cols-1 divide-y">
			{members.map(member => {
				const name = memberName(member)
				const { gives, receives } = optionCounts(model, member.id)
				const stuck = gives === 0 || receives === 0
				return (
					<div key={member.id} className="flex items-center gap-2 transition-colors hover:bg-muted/50">
						<button type="button" onClick={() => onPick(member.id)} className="flex min-w-0 flex-1 items-center gap-3 p-3 text-left">
							<UserAvatar name={name} image={member.image} />
							<div className="min-w-0 flex-1">
								<div className="truncate text-sm font-medium">{name}</div>
								<div className={cn('truncate text-xs', stuck ? 'text-destructive' : 'text-muted-foreground')}>
									{m.admin_exchanges_person_counts({ gives, receives, name: name.split(' ')[0] })}
								</div>
							</div>
						</button>
						<div className="flex shrink-0 items-center gap-1.5 pr-1">
							{member.banned && (
								<span className="inline-flex items-center gap-1 rounded bg-destructive/10 px-1.5 py-0.5 text-3xs font-medium tracking-wide text-destructive uppercase">
									<Ban className="size-3" />
									{m.admin_users_list_banned()}
								</span>
							)}
							{member.role && <UserTypeBadge user={{ role: member.role }} />}
							{canRemove && (
								<Button
									type="button"
									variant="ghost"
									size="icon-sm"
									onClick={() => onRemove(member)}
									disabled={disabled}
									aria-label={m.admin_exchanges_remove_person_aria({ name })}
								>
									<X className="size-4" />
								</Button>
							)}
						</div>
					</div>
				)
			})}
		</div>
	)
}

function PairingsCard({ exchange, nameOf }: { exchange: AdminExchangeDetail; nameOf: (id: string) => string }) {
	const byId = new Map(exchange.members.map(x => [x.id, x]))
	const order = new Map(exchange.members.map((x, i) => [x.id, i]))
	const pairings = [...(exchange.pairings ?? [])].sort((a, b) => (order.get(a.giverMemberId) ?? 0) - (order.get(b.giverMemberId) ?? 0))
	const person = (id: string) => {
		const member = byId.get(id)
		return (
			<span className="flex min-w-0 items-center gap-2">
				<UserAvatar name={nameOf(id)} image={member?.image} size="small" />
				<span className={cn('truncate text-sm', !member?.userId && 'pr-1 text-muted-foreground italic')}>{nameOf(id)}</span>
			</span>
		)
	}
	return (
		<Card className="animate-page-in max-w-2xl">
			<CardHeader>
				<CardTitle className="text-2xl">{m.admin_exchanges_pairings_title()}</CardTitle>
				<CardDescription>{m.admin_exchanges_pairings_description()}</CardDescription>
			</CardHeader>
			<CardContent>
				{pairings.length === 0 ? (
					<div className="text-sm text-muted-foreground">{m.admin_exchanges_pairings_empty()}</div>
				) : (
					<div className="divide-y rounded-md border">
						{pairings.map(p => (
							<div key={p.giverMemberId} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-3 py-2">
								{person(p.giverMemberId)}
								<ArrowRight className="size-4 text-muted-foreground" aria-label={m.admin_exchanges_gifted_to_aria()} />
								{person(p.recipientMemberId)}
							</div>
						))}
					</div>
				)}
			</CardContent>
		</Card>
	)
}
