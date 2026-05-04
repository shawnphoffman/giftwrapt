// UI-facing types for the Intelligence feature. These shapes are what the
// view components consume; the eventual backend (`src/lib/intelligence/`)
// will produce the same shapes via Zod schemas. Keeping them colocated with
// fixtures during the Storybook-first phase so the components can be built
// and reviewed without any DB or API code.

export type AnalyzerId = 'primary-list' | 'stale-items' | 'duplicates' | 'grouping'

export type RecommendationSeverity = 'info' | 'suggest' | 'important'

export type RecommendationStatus = 'active' | 'dismissed' | 'applied'

export type RecGroupKey = 'setup' | 'cleanup' | 'organize'

export type ListSubject = { kind: 'user'; name: string; image?: string | null } | { kind: 'dependent'; name: string; image?: string | null }

export type ListRef = {
	id: string
	name: string
	type: 'wishlist' | 'christmas' | 'birthday' | 'giftideas'
	isPrivate: boolean
	subject: ListSubject
}

export type ItemRef = {
	id: string
	title: string
	listId: string
	listName: string
	imageUrl?: string | null
	updatedAt: Date
	availability: 'available' | 'unavailable'
}

export type ActionIntent =
	| 'do' // direct action that changes state or navigates - green
	| 'noop' // declines / dismisses / "leave as is" - outline
	| 'destructive' // deletes or otherwise irreversible - red
	| 'ai' // hands off to a model - gradient

// Apply payload attached to an action that can be executed server-side
// without leaving the page (vs. informational actions which only
// describe what to do). Currently only the grouping analyzer emits one.
export type RecommendationApply = {
	kind: 'create-group'
	listId: string
	groupType: 'or' | 'order'
	itemIds: Array<string>
	priority: 'very-high' | 'high' | 'normal' | 'low'
}

export type RecommendationAction = {
	label: string // short verb on the button itself: "Merge lists", "Delete items", "Dismiss"
	description: string // sentence(s) on the row explaining what this action does and any consequences
	intent: ActionIntent
	confirmCopy?: string // shown in a confirm dialog before firing apply/dismiss actions
	apply?: RecommendationApply // when set, the rec card renders an apply button that triggers this server-side
	href?: string // when set, the rec card renders the action as a navigation link; never resolves the rec
}

export type AffectedSummary = {
	noun: string // e.g. "items", "lists"
	count: number
	lines: Array<string> // bullet lines for the panel
	listChips?: Array<ListRef> // optional list chips below the bullets
}

export type RecommendationKind =
	| { kind: 'standard' } // standard rec card
	| { kind: 'list-picker'; eligibleLists: Array<ListRef>; saveLabel: string } // inline picker (e.g. set primary list)

export type Recommendation = {
	id: string
	analyzerId: AnalyzerId
	kind: string
	severity: RecommendationSeverity
	status: RecommendationStatus
	title: string
	body: string // short rationale for *why* this matters
	whatHappens?: string // explains the consequence of the primary action in plain language
	createdAt: Date
	dismissedAt?: Date | null
	actions?: Array<RecommendationAction> // ordered list of actions; rendered as description+button rows
	dismissDescription?: string // copy for the always-present Dismiss row; defaults to a generic line
	affected?: AffectedSummary
	relatedLists?: Array<ListRef>
	relatedItems?: Array<ItemRef>
	interaction?: RecommendationKind // discriminator for the in-card UI (default: standard)
}

export type IntelligenceRunSummary = {
	id: string
	startedAt: Date
	finishedAt?: Date | null
	status: 'running' | 'success' | 'error' | 'skipped'
	trigger: 'cron' | 'manual'
	skipReason?: string | null
	error?: string | null
	tokensIn?: number
	tokensOut?: number
	estimatedCostUsd?: number
}

export type IntelligencePageData = {
	enabled: boolean
	providerConfigured: boolean
	recs: Array<Recommendation>
	lastRun?: IntelligenceRunSummary | null
	nextEligibleRefreshAt?: Date | null
}

export type IntelligencePageState =
	| { kind: 'loaded'; data: IntelligencePageData }
	| { kind: 'generating'; data: IntelligencePageData }
	| { kind: 'error'; data: IntelligencePageData; message: string }
	| { kind: 'disabled'; reason: 'feature-disabled' | 'no-provider' }

export type AnalyzerHealth = {
	id: AnalyzerId
	label: string
	enabled: boolean
	avgDurationMs: number
	avgTokensIn: number
	avgTokensOut: number
	activeRecs: number
}

export type RunStatusBucket = {
	success: number
	skipped: Record<string, number>
	error: number
}

export type DailySeriesPoint = {
	date: string // 'YYYY-MM-DD'
	runsSuccess: number
	runsSkipped: number
	runsError: number
	tokensIn: number
	tokensOut: number
	costUsd: number
	activeRecs: number // count of recs in 'active' status at end of day
	dismissedRecs: number // dismissed that day
	appliedRecs: number // applied that day
}

export type AdminIntelligenceData = {
	settings: {
		enabled: boolean
		refreshIntervalDays: number
		manualRefreshCooldownMinutes: number
		candidateCap: number
		concurrency: number
		usersPerInvocation: number
		staleRecRetentionDays: number
		runStepsRetentionDays: number
		dryRun: boolean
		modelOverride?: string | null
		email: {
			enabled: boolean
			weeklyDigestEnabled: boolean
			testRecipient?: string | null
		}
		perAnalyzerEnabled: Record<AnalyzerId, boolean>
	}
	health: {
		totalActiveRecs: number
		analyzers: Array<AnalyzerHealth>
		last24h: RunStatusBucket
		last7d: RunStatusBucket
		dailyTokensIn: number
		dailyTokensOut: number
		dailyEstimatedCostUsd: number
		queue: { overdue: number; gatedByUnreadRecs: number; lockHeld: number }
		provider: {
			source: 'env' | 'db' | 'override' | 'none'
			provider?: string | null
			model?: string | null
		}
	}
	runs: Array<AdminRunRow>
	dailySeries: Array<DailySeriesPoint>
}

export type AdminRunRow = IntelligenceRunSummary & {
	userId: string
	userName: string
	userImage?: string | null
	durationMs?: number | null
	inputHashShort?: string | null
	recCounts: Partial<Record<AnalyzerId, number>>
	// Per-step outcome breakdown so the runs table can show partial
	// failures explicitly instead of hiding them behind a "success" badge.
	//   - ok: a model call returned successfully
	//   - error: the step recorded an error string
	//   - noop: heuristic-only step (no model call)
	stepCounts?: { ok: number; error: number; noop: number }
}

export type RunDetailStep = {
	analyzerId: AnalyzerId
	analyzerLabel: string
	prompt?: string | null
	responseRaw?: string | null
	parsed?: unknown
	tokensIn?: number
	tokensOut?: number
	latencyMs: number
	error?: string | null
}

export type RunDetailDiffEntry = {
	fingerprint: string
	title: string
	change: 'added' | 'removed' | 'unchanged'
}

export type RunDetailData = {
	run: AdminRunRow
	candidateInputs: Array<{ analyzerId: AnalyzerId; analyzerLabel: string; items: Array<ItemRef>; lists: Array<ListRef> }>
	steps: Array<RunDetailStep>
	resultingRecs: Array<Recommendation>
	diff: Array<RunDetailDiffEntry>
}
