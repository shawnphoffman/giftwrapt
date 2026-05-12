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

// Apply payload attached to an action that can be executed server-side
// without leaving the page (vs. informational actions which only
// describe what to do).
export type RecommendationApply =
	| {
			kind: 'create-group'
			listId: string
			groupType: 'or' | 'order'
			itemIds: Array<string>
			priority: 'very-high' | 'high' | 'normal' | 'low'
	  }
	| {
			kind: 'delete-items'
			listId: string
			itemIds: Array<string>
	  }
	| {
			kind: 'set-primary-list'
			listId: string
	  }

export type RecommendationAction = {
	label: string
	description: string
	intent: ActionIntent
	confirmCopy?: string
	apply?: RecommendationApply
	// When set, the rec card renders the action as a navigation link
	// (target=_blank). Navigation actions never resolve the rec; the
	// user can come back and apply or dismiss it explicitly. The
	// list-shaped variant points at /lists/{id} (optionally fragment to
	// an item; openEdit=true opens the item's edit dialog on arrival).
	// The path-shaped variant points at an arbitrary absolute path,
	// for navigation targets that aren't list/item URLs (e.g.
	// '/settings/'). Distinguish with `'path' in nav`.
	nav?: { listId: string; itemId?: string; openEdit?: boolean } | { path: string }
}

export type AffectedSummary = {
	noun: string
	count: number
	lines: Array<string>
	listChips?: Array<ListRef>
}

// A single sub-row inside a bundled rec (see AnalyzerRecOutput.subItems).
// Stable `id` is what gets persisted in recommendation_sub_item_dismissals
// when the user dismisses just one sub-item rather than the whole bundle.
export type RecSubItem = {
	id: string
	title: string
	detail?: string
	thumbnailUrl?: string | null
	nav: { listId: string; itemId: string; openEdit?: boolean }
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
	// Bundled per-list recs carry an ordered list of sub-items, each
	// with their own Edit nav + Skip dismissal. Bundles fingerprint by
	// `(analyzerId, kind, listId)` so sub-item dismissals survive across
	// regenerations even as items rotate in/out of the bundle.
	subItems?: Array<RecSubItem>
	// Bundle-level "Open list" target so the user can bulk-fix all
	// sub-items inline on the list page.
	bundleNav?: { listId: string }
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
				nav: z
					.union([
						z.object({ listId: z.string(), itemId: z.string().optional(), openEdit: z.boolean().optional() }),
						z.object({ path: z.string() }),
					])
					.optional(),
				apply: z
					.discriminatedUnion('kind', [
						z.object({
							kind: z.literal('create-group'),
							listId: z.string(),
							groupType: z.enum(['or', 'order']),
							itemIds: z.array(z.string()),
							priority: z.enum(['very-high', 'high', 'normal', 'low']),
						}),
						z.object({
							kind: z.literal('delete-items'),
							listId: z.string(),
							itemIds: z.array(z.string()),
						}),
						z.object({
							kind: z.literal('set-primary-list'),
							listId: z.string(),
						}),
					])
					.optional(),
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
	subItems: z
		.array(
			z.object({
				id: z.string(),
				title: z.string(),
				detail: z.string().optional(),
				thumbnailUrl: z.string().nullable().optional(),
				nav: z.object({ listId: z.string(), itemId: z.string(), openEdit: z.boolean().optional() }),
			})
		)
		.optional(),
	bundleNav: z.object({ listId: z.string() }).optional(),
})

export type RecPayload = z.infer<typeof recPayloadSchema>
