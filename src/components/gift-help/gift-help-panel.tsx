import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { Check, ExternalLink, Lightbulb, Sparkles, Wand2 } from 'lucide-react'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'

import { getGiftSuggestions, getListInterests, saveGiftSuggestion, type SuggestedGift } from '@/api/gift-suggestions'
import type { ItemWithGifts } from '@/api/lists'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useSession } from '@/lib/auth-client'
import { type Pick, type PickGroup, type PickItem, rankPicks } from '@/lib/gift-picks'
import type { PriceBand } from '@/lib/gift-suggestions/prompt'
import { computeRemainingClaimableQuantity } from '@/lib/gifts'
import { listItemsViewQueryOptions } from '@/lib/queries/items'
import { listDetailKeys } from '@/lib/queries/lists'

// Help for a gifter looking at someone else's list (plan 25):
//
// - "Mostly about": what the list leans toward, from stored facets.
// - Pick for Me: the best few things still open, ranked in the browser
//   from the items the page already has. No AI.
// - Need Ideas?: AI suggestions for things NOT on the list. Only shown
//   when the admin has turned gift suggestions on, and never to a child.
//   A suggestion is kept only if the viewer saves it to their own private
//   gift ideas.

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
	'ai-budget-exceeded': 'Gift suggestions are paused for this month. Try Pick for Me instead.',
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

function parseBudget(draft: string): number | null {
	const n = Number.parseFloat(draft)
	return Number.isFinite(n) && n > 0 ? n : null
}

type SuggestionsState =
	| { phase: 'idle' }
	| { phase: 'loading' }
	| { phase: 'done'; suggestions: Array<SuggestedGift> }
	| { phase: 'error'; message: string }

export type GiftHelpPanelViewProps = {
	recipientName: string
	interests: Array<{ category: string; count: number }>
	budget: string
	onBudgetChange: (value: string) => void
	// null until Pick for Me has been pressed.
	picks: Array<Pick> | null
	onPick: () => void
	// False hides Need Ideas entirely (feature off, or a child account).
	suggestionsAvailable: boolean
	suggestions: SuggestionsState
	onAskIdeas: () => void
	savedTitles: ReadonlySet<string>
	savingTitle: string | null
	onSaveIdea: (suggestion: SuggestedGift) => void
}

export function GiftHelpPanelView({
	recipientName,
	interests,
	budget,
	onBudgetChange,
	picks,
	onPick,
	suggestionsAvailable,
	suggestions,
	onAskIdeas,
	savedTitles,
	savingTitle,
	onSaveIdea,
}: GiftHelpPanelViewProps) {
	return (
		<section className="flex flex-col gap-4 rounded-lg border bg-card p-4" aria-label="Help choosing a gift">
			<div className="space-y-1">
				<h2 className="text-lg font-semibold">Help Me Choose</h2>
				{interests.length > 0 && (
					<p className="text-sm text-muted-foreground">This list is mostly {interests.map(i => categoryLabel(i.category)).join(', ')}.</p>
				)}
			</div>

			<div className="flex flex-wrap items-end gap-3">
				<div className="flex flex-col gap-1">
					<Label htmlFor="gift-help-budget" className="text-sm">
						Budget (Optional)
					</Label>
					<Input
						id="gift-help-budget"
						type="number"
						inputMode="decimal"
						min={0}
						step="1"
						placeholder="Any"
						value={budget}
						onChange={e => onBudgetChange(e.target.value)}
						className="w-28"
					/>
				</div>
				<Button type="button" variant="outline" onClick={onPick}>
					<Wand2 className="size-4" />
					Pick for Me
				</Button>
				{suggestionsAvailable && (
					<Button type="button" onClick={onAskIdeas} disabled={suggestions.phase === 'loading'}>
						<Sparkles className="size-4" />
						{suggestions.phase === 'loading' ? 'Thinking…' : 'Need Ideas?'}
					</Button>
				)}
			</div>

			{picks !== null && (
				<div className="flex flex-col gap-2">
					<h3 className="text-sm font-medium">From {recipientName}’s List</h3>
					{picks.length === 0 ? (
						<p className="text-sm text-muted-foreground">
							Nothing on this list is open{budget ? ' within that budget' : ''} right now.
							{suggestionsAvailable ? ' Try Need Ideas? for something that is not on the list.' : ''}
						</p>
					) : (
						<ul className="flex flex-col gap-2">
							{picks.map(pick => (
								<li key={pick.item.id} className="rounded-md border px-3 py-2">
									<a href={`#item-${pick.item.id}`} className="font-medium underline-offset-4 hover:underline">
										{pick.item.title}
									</a>
									{pick.item.price && <span className="text-sm text-muted-foreground"> · {pick.item.price}</span>}
									<p className="text-xs text-muted-foreground">{pick.reasons.join(' · ')}</p>
								</li>
							))}
						</ul>
					)}
				</div>
			)}

			{suggestionsAvailable && suggestions.phase === 'error' && <p className="text-sm text-destructive">{suggestions.message}</p>}

			{suggestionsAvailable && suggestions.phase === 'done' && (
				<div className="flex flex-col gap-2">
					<h3 className="text-sm font-medium">Ideas That Are Not on the List</h3>
					{suggestions.suggestions.length === 0 ? (
						<p className="text-sm text-muted-foreground">No new ideas this time. Try again, or change the budget.</p>
					) : (
						<ul className="flex flex-col gap-2">
							{suggestions.suggestions.map(s => {
								const saved = savedTitles.has(s.title)
								const band = PRICE_BAND_LABEL[s.priceBand]
								return (
									<li key={s.title} className="flex flex-wrap items-start gap-x-3 gap-y-2 rounded-md border px-3 py-2">
										<div className="min-w-40 flex-1">
											<div className="font-medium">
												{s.title}
												{band && <span className="text-sm font-normal text-muted-foreground"> · {band}</span>}
											</div>
											<p className="text-sm text-muted-foreground">{s.reason}</p>
										</div>
										<div className="ml-auto flex items-center gap-2">
											<Button asChild variant="ghost" size="sm">
												<a href={s.searchUrl} target="_blank" rel="noreferrer noopener">
													<ExternalLink className="size-4" />
													Search
												</a>
											</Button>
											<Button
												type="button"
												variant="outline"
												size="sm"
												disabled={saved || savingTitle === s.title}
												onClick={() => onSaveIdea(s)}
											>
												{saved ? <Check className="size-4" /> : <Lightbulb className="size-4" />}
												{saved ? 'Saved' : 'Save Idea'}
											</Button>
										</div>
									</li>
								)
							})}
						</ul>
					)}
					<p className="text-xs text-muted-foreground">
						These come from an AI model, so check them before you buy. It was shown what is on {recipientName}’s lists and whether each
						thing is already claimed, never who claimed it. A saved idea goes to your private gift ideas, which {recipientName} cannot see.
					</p>
				</div>
			)}
		</section>
	)
}

// Fetching wrapper. Mount inside a `<Suspense fallback={null}>`; it reads
// the same items query the list itself uses, so it adds no item fetch.
export function GiftHelpOnList({
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
	const { data: interestData } = useQuery({
		queryKey: ['list-interests', listId],
		queryFn: () => getListInterests({ data: { listId } }),
		enabled: intelligenceEnabled,
		staleTime: 5 * 60_000,
	})

	const [budget, setBudget] = useState('')
	const [picks, setPicks] = useState<Array<Pick> | null>(null)
	const [suggestions, setSuggestions] = useState<SuggestionsState>({ phase: 'idle' })
	const [savedTitles, setSavedTitles] = useState<ReadonlySet<string>>(() => new Set())

	const pickItems = useMemo(() => items.map(toPickItem), [items])
	const suggestionsAvailable = suggestionsEnabled && session?.user.isChild !== true

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
		mutationFn: (s: SuggestedGift) => saveGiftSuggestion({ data: { listId, title: s.title, notes: s.reason } }),
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

	// Nothing to offer: no items to pick from and no AI to ask.
	if (items.length === 0 && !suggestionsAvailable) return null

	return (
		<GiftHelpPanelView
			recipientName={recipientName}
			interests={interestData?.interests ?? []}
			budget={budget}
			onBudgetChange={setBudget}
			picks={picks}
			onPick={() => setPicks(rankPicks(pickItems, groups, { budget: parseBudget(budget) }))}
			suggestionsAvailable={suggestionsAvailable}
			suggestions={suggestions}
			onAskIdeas={() => ask.mutate()}
			savedTitles={savedTitles}
			savingTitle={save.isPending ? save.variables.title : null}
			onSaveIdea={s => save.mutate(s)}
		/>
	)
}
