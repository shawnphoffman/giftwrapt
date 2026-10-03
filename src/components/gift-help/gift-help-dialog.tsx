import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Check, ExternalLink, Lightbulb, PackagePlus, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import { getGiftSuggestions, getListInterests, saveGiftSuggestion, type SuggestedGift } from '@/api/gift-suggestions'
import { createListAddon } from '@/api/list-addons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useSession } from '@/lib/auth-client'
import type { PriceBand } from '@/lib/gift-suggestions/prompt'
import { buildSearchUrl } from '@/lib/gift-suggestions/search-url'
import { applyListEventLocally } from '@/lib/list-events'
import { listDetailKeys } from '@/lib/queries/lists'

// Help for a gifter looking at someone else's list (plan 25). A "Need
// Ideas?" button in the list's filter row opens a dialog that first asks
// for a budget, then shows AI ideas that are not already on their list
// (the occasion is taken from the type of list, so there is nothing to
// ask). Never offered to a child. A suggestion is kept only if the viewer
// acts on it: saved to their own private gift ideas, or added to this list
// as an off-list gift they are giving.
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

function parseBudget(draft: string): number | null {
	const n = Number.parseFloat(draft)
	return Number.isFinite(n) && n > 0 ? n : null
}

// Shown while the model works, which can take most of a minute. The
// placeholder cards and the moving status line make it read as busy rather
// than stuck. The line advances and then holds on the last step; it does not
// pretend to know how far along the call is.
const THINKING_STEPS = [
	'Reading their list…',
	'Thinking of ideas…',
	'Leaving out what is already on their list…',
	'Writing up what to look for…',
]
const THINKING_STEP_MS = 4000

export function ThinkingOfIdeas() {
	const [step, setStep] = useState(0)
	useEffect(() => {
		const timer = setInterval(() => setStep(n => Math.min(n + 1, THINKING_STEPS.length - 1)), THINKING_STEP_MS)
		return () => clearInterval(timer)
	}, [])
	return (
		<div role="status" aria-live="polite" className="flex flex-col gap-3">
			<p className="flex items-center gap-2 text-sm text-muted-foreground">
				<Sparkles className="size-4 text-fuchsia-500 motion-safe:animate-pulse dark:text-fuchsia-300" aria-hidden />
				<span key={step} className="motion-safe:animate-in motion-safe:fade-in">
					{THINKING_STEPS[step]}
				</span>
			</p>
			{[0, 1, 2].map(n => (
				<div key={n} className="flex flex-col gap-2 rounded-md border px-4 py-3" aria-hidden>
					<Skeleton className="h-4 w-2/5" />
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-4/5" />
				</div>
			))}
			<p className="text-xs text-muted-foreground">This usually takes under a minute.</p>
		</div>
	)
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
	suggestions: SuggestionsState
	savedTitles: ReadonlySet<string>
	savingTitle: string | null
	onSaveIdea: (suggestion: SuggestedGift) => void
	addedTitles: ReadonlySet<string>
	addingTitle: string | null
	onAddOffList: (suggestion: SuggestedGift) => void
	// The admin's search URL template; null means no Search link.
	searchUrlTemplate: string | null
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
	suggestions,
	savedTitles,
	savingTitle,
	onSaveIdea,
	addedTitles,
	addingTitle,
	onAddOffList,
	searchUrlTemplate,
}: GiftHelpDialogViewProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 pr-8">
						<Sparkles className="size-5" /> Gift Ideas for {recipientName}
					</DialogTitle>
					<DialogDescription>
						{interests.length > 0
							? `Their list is mostly ${interests.map(i => categoryLabel(i.category)).join(', ')}.`
							: 'New ideas that are not already on their list.'}
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
						<p className="text-xs text-muted-foreground">
							Ideas come from an AI model. It is shown what is on {recipientName}’s lists and whether each thing is already claimed, never
							who claimed it.
						</p>
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
						<div className="-mx-1 flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-1">
							{suggestions.phase === 'loading' && <ThinkingOfIdeas />}
							{suggestions.phase === 'error' && <p className="text-sm text-destructive">{suggestions.message}</p>}
							{suggestions.phase === 'done' &&
								(suggestions.suggestions.length === 0 ? (
									<p className="text-sm text-muted-foreground">No new ideas this time. Try a different budget.</p>
								) : (
									<>
										<ul className="flex flex-col gap-3">
											{suggestions.suggestions.map(s => {
												const saved = savedTitles.has(s.title)
												const added = addedTitles.has(s.title)
												const band = PRICE_BAND_LABEL[s.priceBand]
												const searchUrl = buildSearchUrl(searchUrlTemplate, s.title)
												return (
													<li key={s.title} className="flex flex-col gap-3 rounded-md border px-4 py-3">
														<div className="flex flex-col gap-1">
															<div className="font-medium">
																{s.title}
																{band && <span className="text-sm font-normal text-muted-foreground"> · {band}</span>}
															</div>
															<p className="text-sm">{s.details}</p>
															<p className="text-sm text-muted-foreground">{s.reason}</p>
														</div>
														<div className="flex flex-wrap items-center justify-end gap-2">
															{searchUrl && (
																<Button asChild variant="ghost" size="sm" className="mr-auto">
																	<a href={searchUrl} target="_blank" rel="noopener noreferrer">
																		<ExternalLink className="size-4" />
																		Search
																	</a>
																</Button>
															)}
															<Button
																type="button"
																variant="outline"
																size="sm"
																disabled={added || addingTitle === s.title}
																onClick={() => onAddOffList(s)}
															>
																{/* Same icon and color as the Off-List Gifts section. */}
																{added ? <Check className="size-4 text-orange-500" /> : <PackagePlus className="size-4 text-orange-500" />}
																{added ? 'Added as Off-List Gift' : 'Add as Off-List Gift'}
															</Button>
															<Button
																type="button"
																variant="outline"
																size="sm"
																disabled={saved || savingTitle === s.title}
																onClick={() => onSaveIdea(s)}
															>
																{/* Same icon and color as gift-ideas lists. */}
																{saved ? <Check className="size-4 text-teal-500" /> : <Lightbulb className="size-4 text-teal-500" />}
																{saved ? 'Saved to Gift Ideas' : 'Save to Gift Ideas'}
															</Button>
														</div>
													</li>
												)
											})}
										</ul>
										<p className="text-xs text-muted-foreground">
											These are ideas to research, not product recommendations: the AI does not know what is in stock or what things cost
											today. Gift Ideas are private to you. An off-list gift tells other gifters you are giving it; {recipientName} sees it
											only after the reveal.
										</p>
									</>
								))}
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

// The filter-row button plus its dialog.
export function GiftHelpButton({ listId, recipientName }: { listId: number; recipientName: string }) {
	const queryClient = useQueryClient()
	const router = useRouter()
	const { data: session } = useSession()
	const suggestionsEnabled = useAppSetting('aiGiftSuggestionsEnabled')
	const intelligenceEnabled = useAppSetting('intelligenceEnabled')
	const searchUrlTemplate = useAppSetting('giftSuggestionsSearchUrl')

	const [open, setOpen] = useState(false)
	const [step, setStep] = useState<'form' | 'results'>('form')
	const [budget, setBudget] = useState('')
	const [suggestions, setSuggestions] = useState<SuggestionsState>({ phase: 'idle' })
	const [savedTitles, setSavedTitles] = useState<ReadonlySet<string>>(() => new Set())
	const [addedTitles, setAddedTitles] = useState<ReadonlySet<string>>(() => new Set())

	const { data: interestData } = useQuery({
		queryKey: ['list-interests', listId],
		queryFn: () => getListInterests({ data: { listId } }),
		enabled: suggestionsEnabled && intelligenceEnabled && open,
		staleTime: 5 * 60_000,
	})

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

	// An off-list gift is a gift the viewer is giving, so it goes on this
	// list through the normal create path (own-list and visibility rules
	// apply there). Only what to look for goes in its notes; the AI's
	// reasoning about the recipient stays out of what other gifters read.
	const addOffList = useMutation({
		mutationFn: (s: SuggestedGift) =>
			createListAddon({ data: { listId, description: s.title.slice(0, 500), notes: s.details.slice(0, 2000) } }),
		onSuccess: (result, s) => {
			if (result.kind !== 'ok') {
				toast.error('Could not add that off-list gift')
				return
			}
			setAddedTitles(prev => new Set(prev).add(s.title))
			toast.success('Off-list gift added')
			applyListEventLocally({ kind: 'addon', listId, addonId: 0 }, { queryClient, router })
		},
		onError: () => toast.error('Could not add that off-list gift'),
	})

	// One flag for the whole feature. Off means the list page is unchanged.
	if (!suggestionsEnabled) return null
	// The dialog is AI ideas only, which a child never gets, so a child sees
	// no button at all.
	if (session?.user.isChild === true) return null

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
					setStep('results')
					ask.mutate()
				}}
				onBack={() => setStep('form')}
				suggestions={suggestions}
				savedTitles={savedTitles}
				savingTitle={save.isPending ? save.variables.title : null}
				onSaveIdea={s => save.mutate(s)}
				addedTitles={addedTitles}
				addingTitle={addOffList.isPending ? addOffList.variables.title : null}
				onAddOffList={s => addOffList.mutate(s)}
				searchUrlTemplate={searchUrlTemplate}
			/>
		</>
	)
}
