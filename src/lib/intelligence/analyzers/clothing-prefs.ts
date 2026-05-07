import { generateObject } from 'ai'
import { and, eq, isNull, ne } from 'drizzle-orm'

import { items, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import {
	buildClothingPrefsPrompt,
	CLOTHING_PREFS_MAX_OPTIONS,
	CLOTHING_PREFS_MAX_RECS,
	type ClothingPrefsCandidate,
	clothingPrefsResponseSchema,
} from '../prompts/clothing-prefs'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef } from '../types'

// AI-driven: hands every active item title + notes to the model and lets
// it (a) classify which are clothing and (b) suggest size/color slates for
// the ones that need preferences pinned down. Heuristic title-detection
// would be brittle ("White hat" - is that color? a brand?), so the model
// owns the call.
export const clothingPrefsAnalyzer: Analyzer = {
	id: 'clothing-prefs',
	label: 'Clothing size & color',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()

		const candidates = await ctx.db
			.select({
				itemId: items.id,
				title: items.title,
				notes: items.notes,
				updatedAt: items.updatedAt,
				availability: items.availability,
				imageUrl: items.imageUrl,
				listId: lists.id,
				listName: lists.name,
				listType: lists.type,
				listIsPrivate: lists.isPrivate,
			})
			.from(items)
			.innerJoin(lists, eq(items.listId, lists.id))
			.where(
				and(
					eq(lists.ownerId, ctx.userId),
					ctx.dependentId === null ? isNull(lists.subjectDependentId) : eq(lists.subjectDependentId, ctx.dependentId),
					eq(lists.isActive, true),
					ne(lists.type, 'giftideas'),
					eq(items.isArchived, false)
				)
			)
			.limit(ctx.candidateCap)

		const loadStep: AnalyzerStep = { name: 'load-candidates', latencyMs: Date.now() - t0 }
		const inputHash = sha256Hex(
			`clothing-prefs|${candidates
				.map(c => `${c.itemId}:${c.updatedAt.toISOString()}`)
				.sort()
				.join(',')}`
		)

		if (candidates.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: combineHashes([inputHash]) }
		}

		// No-AI fallback: this analyzer's whole job is "is this clothing
		// AND is the preference already pinned down?", which is a bad fit
		// for a regex heuristic. Bail out cleanly so users without a model
		// don't get noisy false positives.
		if (!ctx.model) {
			return { recs: [], steps: [loadStep], inputHash: combineHashes([inputHash]) }
		}

		const candidatesById = new Map(candidates.map(c => [String(c.itemId), c]))
		const promptCandidates: Array<ClothingPrefsCandidate> = candidates.map(c => ({
			itemId: String(c.itemId),
			title: c.title,
			notes: c.notes,
			listName: c.listName,
			listType: c.listType,
		}))

		const prompt = buildClothingPrefsPrompt({ candidates: promptCandidates })
		const stepStart = Date.now()
		let parsed: unknown = null
		let responseRaw: string | null = null
		let error: string | null = null
		let tokensIn = 0
		let tokensOut = 0
		try {
			const result = await generateObject({
				model: ctx.model,
				schema: clothingPrefsResponseSchema,
				prompt,
			})
			parsed = result.object
			responseRaw = JSON.stringify(result.object)
			tokensIn = result.usage.inputTokens ?? 0
			tokensOut = result.usage.outputTokens ?? 0
		} catch (err) {
			error = err instanceof Error ? err.message : String(err)
		}
		const aiStep: AnalyzerStep = {
			name: 'clothing-prefs',
			prompt,
			responseRaw,
			parsed,
			tokensIn,
			tokensOut,
			latencyMs: Date.now() - stepStart,
			error,
		}

		if (error || !parsed) {
			return { recs: [], steps: [loadStep, aiStep], inputHash: combineHashes([inputHash]) }
		}

		const aiItems = (
			parsed as {
				items: Array<{
					itemId: string
					include: boolean
					hasSize: boolean
					hasColor: boolean
					headline: string
					rationale: string
					suggestedSizes: Array<string>
					suggestedColors: Array<string>
				}>
			}
		).items
			.filter(it => it.include && !(it.hasSize && it.hasColor))
			.slice(0, CLOTHING_PREFS_MAX_RECS)

		const recs: Array<AnalyzerRecOutput> = []
		for (const ai of aiItems) {
			const row = candidatesById.get(ai.itemId)
			if (!row) continue
			recs.push(buildRec(row, ai, ctx.subject))
		}

		return { recs, steps: [loadStep, aiStep], inputHash: combineHashes([inputHash]) }
	},
}

type CandidateRow = {
	itemId: number
	title: string
	notes: string | null
	updatedAt: Date
	availability: 'available' | 'unavailable'
	imageUrl: string | null
	listId: number
	listName: string
	listType: string
	listIsPrivate: boolean
}

function buildRec(
	row: CandidateRow,
	ai: {
		hasSize: boolean
		hasColor: boolean
		headline: string
		rationale: string
		suggestedSizes: Array<string>
		suggestedColors: Array<string>
	},
	subject: AnalyzerSubject
): AnalyzerRecOutput {
	const listSubject: ListRef['subject'] =
		subject.kind === 'dependent'
			? { kind: 'dependent', name: subject.name, image: subject.image }
			: { kind: 'user', name: subject.name, image: subject.image }
	const listRef: ListRef = {
		id: String(row.listId),
		name: row.listName,
		type: row.listType as ListRef['type'],
		isPrivate: row.listIsPrivate,
		subject: listSubject,
	}
	const itemRef: ItemRef = {
		id: String(row.itemId),
		title: row.title,
		listId: String(row.listId),
		listName: row.listName,
		imageUrl: row.imageUrl,
		updatedAt: row.updatedAt,
		availability: row.availability,
	}
	const sizes = ai.suggestedSizes.slice(0, CLOTHING_PREFS_MAX_OPTIONS)
	const colors = ai.suggestedColors.slice(0, CLOTHING_PREFS_MAX_OPTIONS)
	const lines: Array<string> = [`${row.title} · on ${row.listName}`]
	if (!ai.hasSize && sizes.length > 0) lines.push(`Common sizes: ${sizes.join(', ')}`)
	if (!ai.hasColor && colors.length > 0) lines.push(`Popular colors: ${colors.join(', ')}`)

	return {
		kind: 'clothing-missing-prefs',
		severity: 'suggest',
		title: ai.headline,
		body: ai.rationale,
		actions: [
			{
				label: 'Edit item',
				description: 'Open the edit dialog for this item so you can record size or color in the notes.',
				intent: 'do',
				nav: { listId: String(row.listId), itemId: String(row.itemId), openEdit: true },
			},
		],
		dismissDescription: "Hide this suggestion. We won't surface it again unless this item changes.",
		affected: {
			noun: 'item',
			count: 1,
			lines,
			listChips: [listRef],
		},
		relatedItems: [itemRef],
		relatedLists: [listRef],
		fingerprintTargets: [String(row.itemId)],
	}
}
