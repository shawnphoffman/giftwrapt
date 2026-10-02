import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Check, Lightbulb, Sparkles } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { getGiftSuggestions, getListInterests, saveGiftSuggestion, type SuggestedGift } from '@/api/gift-suggestions'
import type { ItemWithGifts } from '@/api/lists'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useSession } from '@/lib/auth-client'
import { type Pick, type PickGroup, type PickItem, rankPicks } from '@/lib/gift-picks'
import type { PriceBand } from '@/lib/gift-suggestions/prompt'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { listItemsViewQueryOptions } from '@/lib/queries/items'
import { listDetailKeys } from '@/lib/queries/lists'

// Help for a gifter looking at someone else's list (plan 25). A "Need
// Ideas?" button in the list's filter row opens a dialog that first asks
// for a budget, then shows two kinds of answer (the occasion is taken
// from the type of list, so there is nothing to ask):
//
// - From their list: the best few things still open, ranked in the
//   browser from the items the page already has. No AI call.
// - Not on their list: AI suggestions. Never offered to a child, who
//   still gets the picks. A suggestion is kept only if the viewer saves
//   it to their own private gift ideas.
//
// The button, and so the whole feature, is behind the admin's
// `aiGiftSuggestionsEnabled` flag. With it off nothing renders and the
// list page looks as it always did.

const PRICE_BAND_LABEL: Record<PriceBand, string | null> = {
	'under-25': 'Under $25',
	'25-50': '$25 to $50',
	'50-100': '$50 to $100',
	'100-250': '$100 to $250',
	'over-250': 'Over $250',
	unknown: null,
}

const SUGGESTION_ERRORS: Partial<Record<string, string>> = {
	'feature-disabled': 'Gift suggestions are turned off.',
	'not-configured': 'Gift suggestions are not set up on this site yet.',
	'child-not-allowed': 'Gift suggestions are not available on this account.',
	'ai-budget-exceeded': 'Gift suggestions are paused for this month.',
	'rate-limited': 'That is a lot of requests. Try again in a little while.',
	'ai-failed': 'Could not come up with ideas just now. Try again.',
}

export function categoryLabel(slug: string): string {
	return slug
		.split('-')
		.map(w => (w.length ? w[0].toUpperCase() + w.slice(1) : w))
		.join(' & ')
}

export function toPickItem(item: ItemWithGifts): PickItem {
	const remaining = computeRemainingClaimableQuantity(item.quantity, item.gifts)
	return {
		id: item.id,
		title: item.title,
		price: item.price,
		currency: item.currency,
		priority: item.priority,
		quantity: item.quantity,
		claimedQuantity: item.quantity - remaining,
		availability: item.availability,
		groupId: item.groupId,
		groupSortOrder: item.groupSortOrder,
		url: item.url,
		imageUrl: item.imageUrl,
	}
}

// Same rule as the item row's price badge: a bare number gets a dollar
// sign, anything else is shown as the recipient typed it.
function displayPrice(price: string): string {
	const trimmed = price.trim()
	return /^\d+(\.\d+)?$/u.test(trimmed) ? `$${trimmed}` : trimmed
}

function parseBudget(draft: string): number | null {
	const n = Number.parseFloat(draft)
	return Number.isFinite(n) && n > 0 ? n : null
}

export type SuggestionsState =
	| { phase: 'idle' }
	| { phase: 'loading' }
	| { phase: 'done'; suggestions: Array<SuggestedGift> }
	| { phase: 'error'; message: string }

export type GiftHelpDialogViewProps = {
	open: boolean
	onOpenChange: (open: boolean) => void
	recipientName: string
	interests: Array<{ category: string; count: number }>
	// 'form' asks for the budget; 'results' shows the answers.
	step: 'form' | 'results'
	budget: string
	onBudgetChange: (value: string) => void
	onSubmit: () => void
	onBack: () => void
	picks: Array<Pick>
	// Called when a pick is chosen, so the dialog can close and the page
	// can scroll to that item.
	onPickSelected: () => void
	// False for a child account: only the picks from the list are shown.
	suggestionsAvailable: boolean
	suggestions: SuggestionsState
	savedTitles: ReadonlySet<string>
	savingTitle: string | null
	onSaveIdea: (suggestion: SuggestedGift) => void
}

export function GiftHelpDialogView({
	open,
	onOpenChange,
	recipientName,
	interests,
	step,
	budget,
	onBudgetChange,
	onSubmit,
	onBack,
	picks,
	onPickSelected,
	suggestionsAvailable,
	suggestions,
	savedTitles,
	savingTitle,
	onSaveIdea,
}: GiftHelpDialogViewProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Sparkles className="size-5" /> Gift Ideas for {recipientName}
					</DialogTitle>
					<DialogDescription>
						{interests.length > 0
							? `Their list is mostly ${interests.map(i => categoryLabel(i.category)).join(', ')}.`
							: suggestionsAvailable
								? 'The best of what is still open on their list, plus new ideas that are not on it.'
								: 'The best of what is still open on their list.'}
					</DialogDescription>
				</DialogHeader>

				{step === 'form' ? (
					<form
						className="flex flex-col gap-4"
						onSubmit={e => {
							e.preventDefault()
							onSubmit()
						}}
					>
						<div className="grid gap-2">
							<Label htmlFor="gift-help-budget">Budget (Optional)</Label>
							<Input
								id="gift-help-budget"
								type="number"
								inputMode="decimal"
								min={0}
								step="1"
								placeholder="Any amount"
								value={budget}
								onChange={e => onBudgetChange(e.target.value)}
								className="sm:w-48"
								autoFocus
							/>
						</div>
						{suggestionsAvailable && (
							<p className="text-xs text-muted-foreground">
								New ideas come from an AI model. It is shown what is on {recipientName}’s lists and whether each thing is already claimed,
								never who claimed it.
							</p>
						)}
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								Cancel
							</Button>
							<Button type="submit">
								<Sparkles className="size-4" /> Find Ideas
							</Button>
						</DialogFooter>
					</form>
				) : (
					<>
						<div className="-mx-1 flex max-h-[60vh] flex-col gap-5 overflow-y-auto px-1">
							<section className="flex flex-col gap-2">
								<h3 className="text-sm font-medium">From {recipientName}’s List</h3>
								{picks.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										Nothing on this list is open{budget ? ' within that budget' : ''} right now.
									</p>
								) : (
									<ul className="flex flex-col gap-2">
										{picks.map(pick => (
											<li key={pick.item.id} className="rounded-md border px-3 py-2">
												<a
													href={`#item-${pick.item.id}`}
													onClick={onPickSelected}
													className="font-medium underline-offset-4 hover:underline"
												>
													{pick.item.title}
												</a>
												{pick.item.price && <span className="text-sm text-muted-foreground"> · {displayPrice(pick.item.price)}</span>}
												<p className="text-xs text-muted-foreground">{pick.reasons.join(' · ')}</p>
											</li>
										))}
									</ul>
								)}
							</section>

							{suggestionsAvailable && (
								<section className="flex flex-col gap-2">
									<h3 className="text-sm font-medium">Not on Their List</h3>
									{suggestions.phase === 'loading' && <p className="text-sm text-muted-foreground">Thinking of ideas…</p>}
									{suggestions.phase === 'error' && <p className="text-sm text-destructive">{suggestions.message}</p>}
									{suggestions.phase === 'done' &&
										(suggestions.suggestions.length === 0 ? (
											<p className="text-sm text-muted-foreground">No new ideas this time. Try a different budget.</p>
										) : (
											<>
												<ul className="flex flex-col gap-2">
													{suggestions.suggestions.map(s => {
														const saved = savedTitles.has(s.title)
														const band = PRICE_BAND_LABEL[s.priceBand]
														return (
															<li key={s.title} className="flex flex-col gap-2 rounded-md border px-3 py-2">
																<div>
																	<div className="font-medium">
																		{s.title}
																		{band && <span className="text-sm font-normal text-muted-foreground"> · {band}</span>}
																	</div>
																	<p className="text-sm">{s.details}</p>
																	<p className="text-sm text-muted-foreground">{s.reason}</p>
																</div>
																<Button
																	type="button"
																	variant="outline"
																	size="sm"
																	className="self-end"
																	disabled={saved || savingTitle === s.title}
																	onClick={() => onSaveIdea(s)}
																>
																	{saved ? <Check className="size-4" /> : <Lightbulb className="size-4" />}
																	{saved ? 'Saved' : 'Save Idea'}
																</Button>
															</li>
														)
													})}
												</ul>
												<p className="text-xs text-muted-foreground">
													These are ideas to research, not product recommendations: the AI does not know what is in stock or what things
													cost today. A saved idea goes to your private gift ideas, which {recipientName} cannot see.
												</p>
											</>
										))}
								</section>
							)}
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={onBack}>
								Change Budget
							</Button>
							<Button type="button" onClick={() => onOpenChange(false)}>
								Done
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}

// The filter-row button plus its dialog. Mount inside a
// `<Suspense fallback={null}>`; it reads the same items query the list
// itself uses, so it adds no item fetch.
export function GiftHelpButton({
	listId,
	groups,
	recipientName,
}: {
	listId: number
	groups: ReadonlyArray<PickGroup>
	recipientName: string
}) {
	const queryClient = useQueryClient()
	const { data: items } = useSuspenseQuery(listItemsViewQueryOptions(listId))
	const { data: session } = useSession()
	const suggestionsEnabled = useAppSetting('aiGiftSuggestionsEnabled')
	const intelligenceEnabled = useAppSetting('intelligenceEnabled')

	const [open, setOpen] = useState(false)
	const [step, setStep] = useState<'form' | 'results'>('form')
	const [budget, setBudget] = useState('')
	const [picks, setPicks] = useState<Array<Pick>>([])
	const [suggestions, setSuggestions] = useState<SuggestionsState>({ phase: 'idle' })
	const [savedTitles, setSavedTitles] = useState<ReadonlySet<string>>(() => new Set())

	const { data: interestData } = useQuery({
		queryKey: ['list-interests', listId],
		queryFn: () => getListInterests({ data: { listId } }),
		enabled: suggestionsEnabled && intelligenceEnabled && open,
		staleTime: 5 * 60_000,
	})

	const pickItems = useMemo(() => items.map(toPickItem), [items])
	// A child gets the picks from the list but never the AI ideas.
	const suggestionsAvailable = session?.user.isChild !== true

	const ask = useMutation({
		mutationFn: () => getGiftSuggestions({ data: { listId, budget: parseBudget(budget) ?? undefined } }),
		onMutate: () => setSuggestions({ phase: 'loading' }),
		onSuccess: result => {
			if (result.kind === 'ok') setSuggestions({ phase: 'done', suggestions: result.suggestions })
			else setSuggestions({ phase: 'error', message: SUGGESTION_ERRORS[result.reason] ?? 'Could not get ideas for this list.' })
		},
		onError: () => setSuggestions({ phase: 'error', message: 'Could not come up with ideas just now. Try again.' }),
	})

	const save = useMutation({
		// The saved idea keeps what to look for and why, so it still makes
		// sense weeks later on the gift-ideas list.
		mutationFn: (s: SuggestedGift) =>
			saveGiftSuggestion({ data: { listId, title: s.title, notes: [s.details, s.reason].filter(Boolean).join('\n\n') } }),
		onSuccess: (result, s) => {
			if (result.kind !== 'ok') {
				toast.error('Could not save that idea')
				return
			}
			setSavedTitles(prev => new Set(prev).add(s.title))
			toast.success(result.createdList ? `Saved to a new private ideas list for ${recipientName}` : 'Saved to your gift ideas')
			queryClient.invalidateQueries({ queryKey: listDetailKeys.giftIdeas(listId) })
		},
		onError: () => toast.error('Could not save that idea'),
	})

	// One flag for the whole feature. Off means the list page is unchanged.
	if (!suggestionsEnabled) return null
	// Nothing to offer: no items to pick from and no AI to ask.
	if (items.length === 0 && !suggestionsAvailable) return null

	return (
		<>
			{/* The amber / pink / fuchsia wash is the app's AI accent (see the
			    Intelligence nav link), so the button reads as AI without an icon. */}
			<Button
				variant="outline"
				size="xs"
				className="h-7 border-transparent bg-linear-to-r from-amber-500/15 via-pink-500/15 to-fuchsia-500/15 text-xs text-fuchsia-700 shadow-none hover:from-amber-500/25 hover:via-pink-500/25 hover:to-fuchsia-500/25 hover:text-fuchsia-700 dark:from-amber-500/20 dark:via-pink-500/20 dark:to-fuchsia-500/20 dark:text-fuchsia-300 dark:hover:text-fuchsia-200"
				onClick={() => setOpen(true)}
			>
				Need ideas?
			</Button>
			<GiftHelpDialogView
				open={open}
				onOpenChange={next => {
					setOpen(next)
					// Reopening starts from the questions again, with the last answers kept.
					if (!next) setStep('form')
				}}
				recipientName={recipientName}
				interests={interestData?.interests ?? []}
				step={step}
				budget={budget}
				onBudgetChange={setBudget}
				onSubmit={() => {
					setPicks(rankPicks(pickItems, groups, { budget: parseBudget(budget) }))
					setStep('results')
					if (suggestionsAvailable) ask.mutate()
				}}
				onBack={() => setStep('form')}
				picks={picks}
				onPickSelected={() => {
					setOpen(false)
					setStep('form')
				}}
				suggestionsAvailable={suggestionsAvailable}
				suggestions={suggestions}
				savedTitles={savedTitles}
				savingTitle={save.isPending ? save.variables.title : null}
				onSaveIdea={s => save.mutate(s)}
			/>
		</>
	)
}
