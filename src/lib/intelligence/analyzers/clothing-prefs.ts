import { generateObject } from 'ai'
import { and, eq, isNull, ne } from 'drizzle-orm'

import { items, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import { buildClothingPrefsPrompt, type ClothingPrefsCandidate, clothingPrefsResponseSchema } from '../prompts/clothing-prefs'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ListRef, RecSubItem } from '../types'

// AI-driven: hands every active item title + notes to the model and lets
// it (a) classify which are clothing and (b) suggest size/color slates for
// the ones that need preferences pinned down. Bundled per list: the bundle
// body is a static intro, each sub-row keeps the AI's per-item rationale
// as its muted second line. Drops the legacy CLOTHING_PREFS_MAX_RECS
// post-filter since bundling already prevents card-explosion.
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
					ne(lists.type, 'todos'),
					eq(items.isArchived, false),
					isNull(items.pendingDeletionAt)
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

		// Pull every per-item AI result that says (a) it's clothing and (b)
		// at least one preference is missing. We no longer truncate via
		// CLOTHING_PREFS_MAX_RECS: bundling makes "too many cards" a non-issue.
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
		).items.filter(it => it.include && !(it.hasSize && it.hasColor))

		const recs = buildBundles(aiItems, candidatesById, ctx.subject)
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

type AiItem = {
	itemId: string
	hasSize: boolean
	hasColor: boolean
	rationale: string
	suggestedSizes: Array<string>
	suggestedColors: Array<string>
}

function buildBundles(
	aiItems: ReadonlyArray<AiItem>,
	candidatesById: Map<string, CandidateRow>,
	subject: AnalyzerSubject
): Array<AnalyzerRecOutput> {
	const byList = new Map<number, Array<{ ai: AiItem; row: CandidateRow }>>()
	for (const ai of aiItems) {
		const row = candidatesById.get(ai.itemId)
		if (!row) continue
		const arr = byList.get(row.listId) ?? []
		arr.push({ ai, row })
		byList.set(row.listId, arr)
	}
	const recs: Array<AnalyzerRecOutput> = []
	for (const [, listEntries] of byList) {
		listEntries.sort((a, b) => a.row.title.localeCompare(b.row.title))
		const first = listEntries[0].row
		const listRef = makeListRef(first, subject)
		const subItems: Array<RecSubItem> = listEntries.map(({ ai, row }) => ({
			id: String(row.itemId),
			title: row.title,
			detail: ai.rationale,
			thumbnailUrl: row.imageUrl,
			nav: { listId: String(row.listId), itemId: String(row.itemId), openEdit: true },
		}))
		const count = subItems.length
		recs.push({
			kind: 'clothing-missing-prefs',
			severity: 'suggest',
			title: count === 1 ? `Pin down sizing on an item on ${first.listName}` : `Pin down sizing on items on ${first.listName}`,
			body:
				count === 1
					? "This clothing item doesn't have a size or color pinned down. Gifters can guess wrong without one."
					: "These clothing items don't have a size or color pinned down. Gifters can guess wrong without one - the model's per-item notes are below.",
			actions: [],
			dismissDescription: "Hide this suggestion for this list. We won't surface it again unless something changes about these items.",
			affected: {
				noun: count === 1 ? 'item' : 'items',
				count,
				lines: [`${first.listName} · ${count} clothing item${count === 1 ? '' : 's'} missing sizing or color`],
				listChips: [listRef],
			},
			relatedLists: [listRef],
			fingerprintTargets: [`list:${first.listId}`],
			subItems,
			bundleNav: { listId: String(first.listId) },
		})
	}
	return recs
}

function makeListRef(row: CandidateRow, subject: AnalyzerSubject): ListRef {
	const listSubject: ListRef['subject'] =
		subject.kind === 'dependent'
			? { kind: 'dependent', name: subject.name, image: subject.image }
			: { kind: 'user', name: subject.name, image: subject.image }
	return {
		id: String(row.listId),
		name: row.listName,
		type: row.listType as ListRef['type'],
		isPrivate: row.listIsPrivate,
		subject: listSubject,
	}
}
