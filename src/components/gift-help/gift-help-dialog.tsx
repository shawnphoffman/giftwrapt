import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from '@tanstack/react-router'
import { Check, ExternalLink, Lightbulb, PackagePlus, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

import {
	clearGiftSuggestionFeedback,
	getGiftSuggestions,
	getLatestGiftSuggestionSet,
	getListInterests,
	type LatestGiftSuggestionSet,
	type LatestGiftSuggestionSetResult,
	saveGiftSuggestion,
	setGiftSuggestionFeedback,
	type StoredSuggestionSetMeta,
	type SuggestedGift,
	type SuggestionVerdict,
} from '@/api/gift-suggestions'
import { createListAddon } from '@/api/list-addons'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useAppSetting } from '@/hooks/use-app-settings'
import { useSession } from '@/lib/auth-client'
import { formatRelative } from '@/lib/format-relative'
import type { PriceBand } from '@/lib/gift-suggestions/prompt'
import { buildSearchUrl } from '@/lib/gift-suggestions/search-url'
import { formatList } from '@/lib/i18n/format'
import { applyListEventLocally } from '@/lib/list-events'
import { listDetailKeys } from '@/lib/queries/lists'
import { cn } from '@/lib/utils'
import { m } from '@/paraglide/messages.js'

// Help for a gifter looking at someone else's list (plan 25). A "Need
// Ideas?" button in the list's filter row opens a dialog that first asks
// for a budget, then shows AI ideas that are not already on their list
// (the occasion is taken from the type of list, so there is nothing to
// ask). Never offered to a child. The last answer is kept for the viewer
// (plan 29a): reopening shows it again with a "New Ideas" button instead of
// asking the model, and an idea reaches anyone else only when the viewer
// acts on it: saved to their own private gift ideas, or added to this list
// as an off-list gift they are giving. Two marks tune future answers (plan
// 29b): "They Have It" keeps the idea out of every gifter's ideas for this
// person, a thumbs down only out of the viewer's own. The recipient never
// sees either.
//
// The button, and so the whole feature, is behind the admin's
// `aiGiftSuggestionsEnabled` flag. With it off nothing renders and the
// list page looks as it always did.

// The words come from the catalog on each call. The amounts are still
// printed with a hardcoded `$` (money formatting is its own later change).
function priceBandLabel(band: PriceBand): string | null {
	switch (band) {
		case 'under-25':
			return m.gift_help_price_under({ amount: '$25' })
		case '25-50':
			return m.gift_help_price_range({ low: '$25', high: '$50' })
		case '50-100':
			return m.gift_help_price_range({ low: '$50', high: '$100' })
		case '100-250':
			return m.gift_help_price_range({ low: '$100', high: '$250' })
		case 'over-250':
			return m.gift_help_price_over({ amount: '$250' })
		case 'unknown':
			return null
	}
}

// What to say for each reason the server can refuse; anything else gets the
// general line.
function suggestionErrorMessage(reason: string): string {
	switch (reason) {
		case 'feature-disabled':
			return m.gift_help_error_feature_disabled()
		case 'not-configured':
			return m.gift_help_error_not_configured()
		case 'child-not-allowed':
			return m.gift_help_error_child_not_allowed()
		case 'ai-budget-exceeded':
			return m.gift_help_error_budget_exceeded()
		case 'rate-limited':
			return m.gift_help_error_rate_limited()
		case 'ai-failed':
			return m.gift_help_error_ai_failed()
		default:
			return m.gift_help_error_generic()
	}
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
const THINKING_STEPS: ReadonlyArray<() => string> = [
	() => m.gift_help_thinking_reading(),
	() => m.gift_help_thinking_ideas(),
	() => m.gift_help_thinking_excluding(),
	() => m.gift_help_thinking_writing(),
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
					{THINKING_STEPS[step]()}
				</span>
			</p>
			{[0, 1, 2].map(n => (
				<div key={n} className="flex flex-col gap-2 rounded-md border px-4 py-3" aria-hidden>
					<Skeleton className="h-4 w-2/5" />
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-4/5" />
				</div>
			))}
			<p className="text-xs text-muted-foreground">{m.gift_help_thinking_duration()}</p>
		</div>
	)
}

export type SuggestionsState =
	| { phase: 'idle' }
	// Looking for the viewer's last answer before deciding which step to show.
	| { phase: 'checking' }
	| { phase: 'loading' }
	// `set` is the stored answer this came from; null in stories that show
	// results on their own.
	| { phase: 'done'; suggestions: Array<SuggestedGift>; set: StoredSuggestionSetMeta | null }
	| { phase: 'error'; message: string }

// Placeholder cards while the stored answer loads: quick, so no status line.
function CheckingForIdeas() {
	return (
		<div role="status" aria-label={m.gift_help_checking_aria()} className="flex flex-col gap-3">
			{[0, 1, 2].map(n => (
				<div key={n} className="flex flex-col gap-2 rounded-md border px-4 py-3" aria-hidden>
					<Skeleton className="h-4 w-2/5" />
					<Skeleton className="h-3 w-full" />
					<Skeleton className="h-3 w-4/5" />
				</div>
			))}
		</div>
	)
}

// "Ideas from 3 days ago, for Christmas, up to $50." The occasion and
// budget are the ones the set was made with, which may not match the list
// the viewer is on now.
export function storedSetCaption(set: StoredSuggestionSetMeta, now: number = Date.now()): string {
	const when = formatRelative(set.createdAt, now)
	const occasion = set.occasion
	// Still a hardcoded `$`: money formatting is its own later change.
	const amount = set.budget !== null ? `$${set.budget}` : null
	if (occasion && amount !== null) return m.gift_help_stored_caption_occasion_budget({ when, occasion, amount })
	if (occasion) return m.gift_help_stored_caption_occasion({ when, occasion })
	if (amount !== null) return m.gift_help_stored_caption_budget({ when, amount })
	return m.gift_help_stored_caption({ when })
}

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
	// The viewer's own marks, by title. A marked idea collapses to one line with Undo.
	verdicts: ReadonlyMap<string, SuggestionVerdict>
	markingTitle: string | null
	onMark: (suggestion: SuggestedGift, verdict: SuggestionVerdict) => void
	onUnmark: (suggestion: SuggestedGift) => void
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
	verdicts,
	markingTitle,
	onMark,
	onUnmark,
	searchUrlTemplate,
}: GiftHelpDialogViewProps) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 pr-8">
						<Sparkles className="size-5" /> {m.gift_help_dialog_title({ name: recipientName })}
					</DialogTitle>
					<DialogDescription>
						{interests.length > 0
							? m.gift_help_description_interests({
									categories: formatList(
										interests.map(i => categoryLabel(i.category)),
										'unit'
									),
								})
							: m.gift_help_description_default()}
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
							<Label htmlFor="gift-help-budget">{m.gift_help_budget_label()}</Label>
							<Input
								id="gift-help-budget"
								type="number"
								inputMode="decimal"
								min={0}
								step="1"
								placeholder={m.gift_help_budget_placeholder()}
								value={budget}
								onChange={e => onBudgetChange(e.target.value)}
								className="sm:w-48"
								autoFocus
							/>
						</div>
						<p className="text-xs text-muted-foreground">{m.gift_help_privacy_note({ name: recipientName })}</p>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
								{m.action_cancel()}
							</Button>
							<Button type="submit">
								<Sparkles className="size-4" /> {m.gift_help_find_button()}
							</Button>
						</DialogFooter>
					</form>
				) : (
					<>
						<div className="-mx-1 flex max-h-[65vh] flex-col gap-3 overflow-y-auto px-1">
							{suggestions.phase === 'checking' && <CheckingForIdeas />}
							{suggestions.phase === 'loading' && <ThinkingOfIdeas />}
							{suggestions.phase === 'error' && <p className="text-sm text-destructive">{suggestions.message}</p>}
							{suggestions.phase === 'done' &&
								(suggestions.suggestions.length === 0 ? (
									<p className="text-sm text-muted-foreground">{m.gift_help_no_results()}</p>
								) : (
									<>
										{suggestions.set && <p className="text-xs text-muted-foreground">{storedSetCaption(suggestions.set)}</p>}
										<ul className="flex flex-col gap-3">
											{suggestions.suggestions.map(s => {
												const saved = savedTitles.has(s.title)
												const added = addedTitles.has(s.title)
												const band = priceBandLabel(s.priceBand)
												const searchUrl = buildSearchUrl(searchUrlTemplate, s.title)
												const verdict = verdicts.get(s.title)
												const marking = markingTitle === s.title
												if (verdict) {
													return (
														<li
															key={s.title}
															className="flex flex-col gap-2 rounded-md border border-dashed px-4 py-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:gap-3"
														>
															<span className="min-w-0 truncate line-through">{s.title}</span>
															<span className="flex shrink-0 items-center justify-between gap-2">
																<span className="text-xs">
																	{verdict === 'has-it'
																		? m.gift_help_has_it_note({ name: recipientName })
																		: m.gift_help_not_for_them_note()}
																</span>
																<Button type="button" variant="outline" size="sm" disabled={marking} onClick={() => onUnmark(s)}>
																	{m.action_undo()}
																</Button>
															</span>
														</li>
													)
												}
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
														{/* Two aligned grids at the default button height: the save actions as an
														    equal pair (stacked on phones), then Search and the two marks in equal
														    columns (Search full width on phones). */}
														<div className="flex flex-col gap-2">
															<div className="grid gap-2 sm:grid-cols-2">
																<Button
																	type="button"
																	variant="outline"
																	disabled={saved || savingTitle === s.title}
																	onClick={() => onSaveIdea(s)}
																>
																	{/* Same icon and color as gift-ideas lists. */}
																	{saved ? <Check className="size-4 text-teal-500" /> : <Lightbulb className="size-4 text-teal-500" />}
																	{saved ? m.gift_help_saved_button() : m.gift_help_save_button()}
																</Button>
																<Button
																	type="button"
																	variant="outline"
																	disabled={added || addingTitle === s.title}
																	onClick={() => onAddOffList(s)}
																>
																	{/* Same icon and color as the Off-List Gifts section. */}
																	{added ? (
																		<Check className="size-4 text-orange-500" />
																	) : (
																		<PackagePlus className="size-4 text-orange-500" />
																	)}
																	{added ? m.gift_help_added_off_list_button() : m.gift_help_add_off_list_button()}
																</Button>
															</div>
															<div className={cn('grid grid-cols-2 gap-2', searchUrl && 'sm:grid-cols-3')}>
																{searchUrl && (
																	<Button asChild variant="outline" className="max-sm:col-span-2">
																		<a href={searchUrl} target="_blank" rel="noopener noreferrer">
																			<ExternalLink className="size-4" />
																			{m.action_search()}
																		</a>
																	</Button>
																)}
																<Button
																	type="button"
																	variant="outline"
																	disabled={marking}
																	title={m.gift_help_has_it_note({ name: recipientName })}
																	aria-label={m.gift_help_has_it_aria({ title: s.title })}
																	onClick={() => onMark(s, 'has-it')}
																>
																	<ThumbsUp className="size-4" />
																	{m.gift_help_has_it_button()}
																</Button>
																<Button
																	type="button"
																	variant="outline"
																	disabled={marking}
																	title={m.gift_help_not_for_them_note()}
																	aria-label={m.gift_help_not_for_them_aria({ title: s.title })}
																	onClick={() => onMark(s, 'not-for-me')}
																>
																	<ThumbsDown className="size-4" />
																	{m.gift_help_not_for_them_button()}
																</Button>
															</div>
														</div>
													</li>
												)
											})}
										</ul>
										<p className="text-xs text-muted-foreground">{m.gift_help_footnote({ name: recipientName })}</p>
									</>
								))}
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={onBack} disabled={suggestions.phase === 'checking'}>
								{m.gift_help_new_ideas_button()}
							</Button>
							<Button type="button" onClick={() => onOpenChange(false)}>
								{m.action_done()}
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
	const isChild = session?.user.isChild === true
	const suggestionsEnabled = useAppSetting('aiGiftSuggestionsEnabled')
	const intelligenceEnabled = useAppSetting('intelligenceEnabled')
	const searchUrlTemplate = useAppSetting('giftSuggestionsSearchUrl')

	const [open, setOpen] = useState(false)
	const [step, setStep] = useState<'form' | 'results'>('form')
	const [budget, setBudget] = useState('')
	const [suggestions, setSuggestions] = useState<SuggestionsState>({ phase: 'idle' })
	const [savedTitles, setSavedTitles] = useState<ReadonlySet<string>>(() => new Set())
	const [addedTitles, setAddedTitles] = useState<ReadonlySet<string>>(() => new Set())
	const [verdicts, setVerdicts] = useState<ReadonlyMap<string, SuggestionVerdict>>(() => new Map())

	const { data: interestData } = useQuery({
		queryKey: ['list-interests', listId],
		queryFn: () => getListInterests({ data: { listId } }),
		enabled: suggestionsEnabled && intelligenceEnabled && open,
		staleTime: 5 * 60_000,
	})

	// The viewer's last answer for this person. Read on open, free of charge;
	// kept fresh here after asking, saving, and adding so a reopen within the
	// stale window shows what the viewer last saw.
	const latestKey = ['gift-suggestion-set', listId] as const
	const latest = useQuery({
		queryKey: latestKey,
		queryFn: () => getLatestGiftSuggestionSet({ data: { listId } }),
		enabled: suggestionsEnabled && !isChild && open,
		staleTime: 5 * 60_000,
	})

	// Decide the first step from the stored answer: results when there is
	// one, the budget form when there is none. Runs only while nothing else
	// has happened in this opening (idle or still checking).
	useEffect(() => {
		if (!open) return
		if (suggestions.phase !== 'idle' && suggestions.phase !== 'checking') return
		if (latest.isPending) {
			if (suggestions.phase !== 'checking') {
				setSuggestions({ phase: 'checking' })
				setStep('results')
			}
			return
		}
		const set = latest.data?.kind === 'ok' ? latest.data.set : null
		if (set) {
			const { suggestions: stored, savedTitles: saved, addedTitles: added, feedback, ...meta } = set
			setSuggestions({ phase: 'done', suggestions: stored, set: meta })
			setSavedTitles(new Set(saved))
			setAddedTitles(new Set(added))
			setVerdicts(new Map(feedback.map(f => [f.title, f.verdict])))
			setStep('results')
		} else if (suggestions.phase !== 'idle') {
			setSuggestions({ phase: 'idle' })
			setStep('form')
		} else {
			setStep('form')
		}
	}, [open, latest.isPending, latest.data, suggestions.phase])

	const patchCachedSet = (patch: (set: LatestGiftSuggestionSet) => LatestGiftSuggestionSet) =>
		queryClient.setQueryData<LatestGiftSuggestionSetResult>(latestKey, prev =>
			prev?.kind === 'ok' && prev.set ? { ...prev, set: patch(prev.set) } : prev
		)
	const markInCache = (field: 'savedTitles' | 'addedTitles', title: string) =>
		patchCachedSet(set => ({ ...set, [field]: [...set[field], title] }))

	const ask = useMutation({
		mutationFn: () => getGiftSuggestions({ data: { listId, budget: parseBudget(budget) ?? undefined } }),
		onMutate: () => setSuggestions({ phase: 'loading' }),
		onSuccess: result => {
			if (result.kind === 'ok') {
				setSuggestions({ phase: 'done', suggestions: result.suggestions, set: result.set })
				// A fresh set never repeats what the viewer saved, added, or marked,
				// so the marks start empty.
				setSavedTitles(new Set())
				setAddedTitles(new Set())
				setVerdicts(new Map())
				queryClient.setQueryData<LatestGiftSuggestionSetResult>(latestKey, {
					kind: 'ok',
					recipientName: result.recipientName,
					set: { ...result.set, suggestions: result.suggestions, savedTitles: [], addedTitles: [], feedback: [] },
				})
			} else setSuggestions({ phase: 'error', message: suggestionErrorMessage(result.reason) })
		},
		onError: () => setSuggestions({ phase: 'error', message: m.gift_help_error_ai_failed() }),
	})

	const save = useMutation({
		// The saved idea keeps what to look for and why, so it still makes
		// sense weeks later on the gift-ideas list.
		mutationFn: (s: SuggestedGift) =>
			saveGiftSuggestion({ data: { listId, title: s.title, notes: [s.details, s.reason].filter(Boolean).join('\n\n') } }),
		onSuccess: (result, s) => {
			if (result.kind !== 'ok') {
				toast.error(m.gift_help_save_failed())
				return
			}
			setSavedTitles(prev => new Set(prev).add(s.title))
			markInCache('savedTitles', s.title)
			toast.success(result.createdList ? m.gift_help_saved_new_list({ name: recipientName }) : m.gift_help_saved_toast())
			queryClient.invalidateQueries({ queryKey: listDetailKeys.giftIdeas(listId) })
		},
		onError: () => toast.error(m.gift_help_save_failed()),
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
				toast.error(m.gift_help_add_off_list_failed())
				return
			}
			setAddedTitles(prev => new Set(prev).add(s.title))
			markInCache('addedTitles', s.title)
			toast.success(m.gift_help_off_list_added())
			applyListEventLocally({ kind: 'addon', listId, addonId: 0 }, { queryClient, router })
		},
		onError: () => toast.error(m.gift_help_add_off_list_failed()),
	})

	// A mark is stored by title, so it outlives this set; the card collapses
	// to one line with Undo. "They Have It" is shared with every gifter of
	// this person, a thumbs down stays with the viewer.
	const mark = useMutation({
		mutationFn: ({ s, verdict }: { s: SuggestedGift; verdict: SuggestionVerdict }) =>
			setGiftSuggestionFeedback({ data: { listId, title: s.title, verdict } }),
		onSuccess: (result, { s, verdict }) => {
			if (result.kind !== 'ok') {
				toast.error(m.gift_help_mark_failed())
				return
			}
			setVerdicts(prev => new Map(prev).set(s.title, verdict))
			patchCachedSet(set => ({ ...set, feedback: [...set.feedback.filter(f => f.title !== s.title), { title: s.title, verdict }] }))
		},
		onError: () => toast.error(m.gift_help_mark_failed()),
	})
	const unmark = useMutation({
		mutationFn: (s: SuggestedGift) => clearGiftSuggestionFeedback({ data: { listId, title: s.title } }),
		onSuccess: (result, s) => {
			if (result.kind !== 'ok') {
				toast.error(m.gift_help_unmark_failed())
				return
			}
			setVerdicts(prev => {
				const next = new Map(prev)
				next.delete(s.title)
				return next
			})
			patchCachedSet(set => ({ ...set, feedback: set.feedback.filter(f => f.title !== s.title) }))
		},
		onError: () => toast.error(m.gift_help_unmark_failed()),
	})

	// One flag for the whole feature. Off means the list page is unchanged.
	if (!suggestionsEnabled) return null
	// The dialog is AI ideas only, which a child never gets, so a child sees
	// no button at all.
	if (isChild) return null

	return (
		<>
			{/* The amber / pink / fuchsia wash is the app's AI accent (see the
			    Intelligence nav link), so the button reads as AI without an icon. */}
			<Button
				variant="outline"
				size="xs"
				className="border-transparent bg-linear-to-r from-amber-500/15 via-pink-500/15 to-fuchsia-500/15 text-fuchsia-700 shadow-none hover:from-amber-500/25 hover:via-pink-500/25 hover:to-fuchsia-500/25 hover:text-fuchsia-700 dark:from-amber-500/20 dark:via-pink-500/20 dark:to-fuchsia-500/20 dark:text-fuchsia-300 dark:hover:text-fuchsia-200"
				onClick={() => setOpen(true)}
			>
				{m.gift_help_open_button()}
			</Button>
			<GiftHelpDialogView
				open={open}
				onOpenChange={next => {
					setOpen(next)
					// Closing forgets the in-dialog state; reopening starts from the
					// stored answer again (kept fresh above), with the budget kept.
					if (!next) {
						setStep('form')
						setSuggestions({ phase: 'idle' })
					}
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
				verdicts={verdicts}
				markingTitle={mark.isPending ? mark.variables.s.title : unmark.isPending ? unmark.variables.title : null}
				onMark={(s, verdict) => mark.mutate({ s, verdict })}
				onUnmark={s => unmark.mutate(s)}
				searchUrlTemplate={searchUrlTemplate}
			/>
		</>
	)
}
