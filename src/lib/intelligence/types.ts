import { z } from 'zod'

import type { ListRef as UiListRef } from '@/components/intelligence/__fixtures__/types'
import type { RecommendationSeverity } from '@/db/schema'

// ─── Public-facing types ────────────────────────────────────────────────────
//
// Mirrors the UI-side shapes in `src/components/intelligence/__fixtures__/types.ts`
// so the wire shape from `src/api/intelligence.ts` matches what the components
// already render. Re-exported here so the runner doesn't import UI fixtures.

export type RecGroupKey = 'setup' | 'cleanup' | 'organize'

export const ACTION_INTENTS = ['do', 'noop', 'destructive', 'ai'] as const
export type ActionIntent = (typeof ACTION_INTENTS)[number]

export type ListRef = UiListRef

export type ItemRef = {
	id: string
	title: string
	listId: string
	listName: string
	imageUrl?: string | null
	updatedAt: Date
	availability: 'available' | 'unavailable'
}

export type RecommendationAction = {
	label: string
	description: string
	intent: ActionIntent
	confirmCopy?: string
}

export type AffectedSummary = {
	noun: string
	count: number
	lines: Array<string>
	listChips?: Array<ListRef>
}

export type RecommendationInteraction = { kind: 'standard' } | { kind: 'list-picker'; eligibleLists: Array<ListRef>; saveLabel: string }

// ─── Analyzer output ────────────────────────────────────────────────────────

export type AnalyzerRecOutput = {
	kind: string
	severity: RecommendationSeverity
	title: string
	body: string
	actions?: Array<RecommendationAction>
	dismissDescription?: string
	affected?: AffectedSummary
	relatedLists?: Array<ListRef>
	relatedItems?: Array<ItemRef>
	interaction?: RecommendationInteraction
	// Stable target ids that, combined with analyzerId + kind, define the
	// rec's fingerprint. Order doesn't matter; we sort before hashing.
	fingerprintTargets: Array<string>
}

export type AnalyzerStep = {
	name: string
	prompt?: string | null
	responseRaw?: string | null
	parsed?: unknown
	tokensIn?: number
	tokensOut?: number
	latencyMs: number
	error?: string | null
}

export type AnalyzerResult = {
	recs: Array<AnalyzerRecOutput>
	steps: Array<AnalyzerStep>
	// Combined input hash slice for this analyzer's view of the user's data.
	// Returning `null` means "this analyzer didn't read enough to invalidate
	// based on input changes" (e.g. an analyzer that only checks a flag).
	inputHash: string | null
}

// ─── Recommendation payload (jsonb on the row) ──────────────────────────────
//
// Whatever we put in `recommendations.payload` is what the `getMyRecommendations`
// server function returns to the UI. Keep it close to the analyzer output
// minus the fingerprint targets (we already store the fingerprint as its own
// column).

export const recPayloadSchema = z.object({
	actions: z
		.array(
			z.object({
				label: z.string(),
				description: z.string(),
				intent: z.enum(ACTION_INTENTS),
				confirmCopy: z.string().optional(),
			})
		)
		.optional(),
	dismissDescription: z.string().optional(),
	affected: z
		.object({
			noun: z.string(),
			count: z.number(),
			lines: z.array(z.string()),
			listChips: z.array(z.unknown()).optional(),
		})
		.optional(),
	relatedLists: z.array(z.unknown()).optional(),
	relatedItems: z.array(z.unknown()).optional(),
	interaction: z.unknown().optional(),
})

export type RecPayload = z.infer<typeof recPayloadSchema>
