import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { getUsersAsAdmin } from '@/api/admin'
import { createGiftExchangeAsAdmin, updateGiftExchangeAsAdmin } from '@/api/gift-exchanges'
import UserAvatar from '@/components/common/user-avatar'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMoney } from '@/hooks/use-money'
import { normalizeAmountInput, parseAmount } from '@/lib/i18n/format'
import { m } from '@/paraglide/messages.js'

import { GiftExchangePersonPicker, type PickablePerson } from './gift-exchange-person-picker'
import { refusalMessage } from './gift-exchange-text'

type EditableExchange = { id: string; name: string; budget: number | null; giftDate: string }

type AdminUserRow = PickablePerson & { banned: boolean }

export const GIFT_EXCHANGES_QUERY_KEY = ['admin', 'gift-exchanges'] as const

function budgetDraft(budget: number | null): string {
	if (budget === null) return ''
	return Number.isInteger(budget) ? String(budget) : budget.toFixed(2)
}

/**
 * Add Exchange (name, budget, gift date, people) and Edit (the same without
 * people, which the People card manages). Shaped like the Edit Dependent
 * dialog.
 */
export function GiftExchangeDetailsDialog({
	open,
	onOpenChange,
	exchange,
	onCreated,
}: {
	open: boolean
	onOpenChange: (open: boolean) => void
	/** Edit this exchange; omit to add one. */
	exchange?: EditableExchange
	onCreated?: (id: string) => void
}) {
	const queryClient = useQueryClient()
	const money = useMoney()
	const creating = !exchange

	const usersQuery = useQuery({
		queryKey: ['admin', 'users'],
		queryFn: () => getUsersAsAdmin(),
		staleTime: 5 * 60 * 1000,
		enabled: creating && open,
	})
	const allUsers = (usersQuery.data ?? []) as Array<AdminUserRow>

	const [name, setName] = useState(exchange?.name ?? '')
	const [budget, setBudget] = useState(budgetDraft(exchange?.budget ?? null))
	const [giftDate, setGiftDate] = useState<string | undefined>(exchange?.giftDate)
	const [chosenIds, setChosenIds] = useState<Array<string>>([])
	const [currentYear] = useState(() => new Date().getUTCFullYear())

	useEffect(() => {
		if (!open) return
		setName(exchange?.name ?? '')
		setBudget(budgetDraft(exchange?.budget ?? null))
		setGiftDate(exchange?.giftDate)
		setChosenIds([])
	}, [open, exchange?.id, exchange?.name, exchange?.budget, exchange?.giftDate])

	const budgetText = normalizeAmountInput(budget)
	const budgetAmount = budgetText === '' ? null : parseAmount(budgetText)
	const budgetInvalid = budgetText !== '' && budgetAmount === null
	const dateValid = giftDate !== undefined && /^\d{4}-\d{2}-\d{2}$/.test(giftDate)
	const canSubmit = name.trim().length > 0 && dateValid && !budgetInvalid

	const eligible = allUsers.filter(u => !u.banned)
	const chosen = chosenIds.map(id => eligible.find(u => u.id === id)).filter((u): u is AdminUserRow => Boolean(u))
	const remaining = eligible.filter(u => !chosenIds.includes(u.id))

	const mutation = useMutation({
		mutationFn: async () => {
			const fields = { name: name.trim(), budget: budgetAmount, giftDate: giftDate! }
			if (exchange) return updateGiftExchangeAsAdmin({ data: { exchangeId: exchange.id, ...fields } })
			return createGiftExchangeAsAdmin({ data: { ...fields, memberUserIds: chosenIds } })
		},
		onSuccess: result => {
			if (result.kind === 'error') {
				const msg = refusalMessage(result, () => '')
				toast.error(msg.title, { description: msg.description })
				return
			}
			queryClient.invalidateQueries({ queryKey: GIFT_EXCHANGES_QUERY_KEY })
			if ('id' in result && typeof result.id === 'string') {
				toast.success(m.admin_exchanges_created_toast())
				onOpenChange(false)
				onCreated?.(result.id)
			} else {
				toast.success(m.admin_exchanges_saved_toast())
				onOpenChange(false)
			}
		},
		onError: () => toast.error(m.admin_exchanges_save_failed()),
	})

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-xl">
				<DialogHeader>
					<DialogTitle>{creating ? m.admin_exchanges_dialog_add_title() : m.admin_exchanges_dialog_edit_title()}</DialogTitle>
				</DialogHeader>
				<form
					onSubmit={e => {
						e.preventDefault()
						if (canSubmit && !mutation.isPending) mutation.mutate()
					}}
					className="space-y-4"
				>
					<div className="grid gap-2">
						<Label htmlFor="exchange-name">{m.admin_exchanges_name_label()}</Label>
						<Input
							id="exchange-name"
							value={name}
							onChange={e => setName(e.target.value)}
							placeholder={m.admin_exchanges_name_placeholder()}
							maxLength={120}
							disabled={mutation.isPending}
						/>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="grid gap-2 content-start">
							<Label htmlFor="exchange-budget">{m.admin_exchanges_budget_label()}</Label>
							<Input
								id="exchange-budget"
								inputMode="decimal"
								value={budget}
								onChange={e => setBudget(e.target.value)}
								placeholder={money.roundAmount(50)}
								aria-invalid={budgetInvalid || undefined}
								disabled={mutation.isPending}
							/>
							{budgetInvalid && <p className="text-xs text-destructive">{m.admin_exchanges_budget_invalid()}</p>}
						</div>
						<div className="grid gap-2 content-start">
							<Label htmlFor="exchange-date">{m.admin_exchanges_gift_date_label()}</Label>
							<DatePicker
								id="exchange-date"
								value={giftDate}
								onChange={setGiftDate}
								fromYear={currentYear - 1}
								toYear={currentYear + 5}
								disabled={mutation.isPending}
							/>
						</div>
					</div>

					{creating && (
						<div className="space-y-2">
							<Label>{m.admin_exchanges_people_label()}</Label>
							{chosen.length > 0 && (
								<div className="flex flex-wrap gap-2">
									{chosen.map(u => {
										const label = u.name || u.email
										return (
											<button
												key={u.id}
												type="button"
												onClick={() => setChosenIds(prev => prev.filter(x => x !== u.id))}
												className="inline-flex max-w-full items-center gap-2 rounded-full border bg-muted/50 py-1 pr-2 pl-1 text-xs hover:bg-muted"
												aria-label={m.admin_exchanges_remove_person_aria({ name: label })}
											>
												<UserAvatar name={label} image={u.image} size="small" />
												<span className="truncate">{label}</span>
												<X className="size-3 shrink-0" />
											</button>
										)
									})}
								</div>
							)}
							<GiftExchangePersonPicker
								people={remaining}
								onPick={id => setChosenIds(prev => [...prev, id])}
								onPickEverybody={() => setChosenIds(prev => [...prev, ...remaining.map(u => u.id)])}
								disabled={mutation.isPending}
							/>
						</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>
							{m.action_cancel()}
						</Button>
						<Button type="submit" disabled={!canSubmit || mutation.isPending}>
							{creating && <Plus className="size-4" />}
							{creating
								? mutation.isPending
									? m.admin_exchanges_adding()
									: m.admin_exchanges_add()
								: mutation.isPending
									? m.state_saving()
									: m.action_save()}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	)
}
