import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm'

import { items, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef } from '../types'

// Heuristic-only: surfaces items the user added a URL to but never filled in
// a price for. Shoppers filter and budget by price, so a missing price makes
// the item less actionable. We deliberately don't try to estimate the price
// here - the rec just nudges the user back to the edit dialog.
export const missingPriceAnalyzer: Analyzer = {
	id: 'missing-price',
	label: 'Missing prices',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()

		const candidates = await ctx.db
			.select({
				itemId: items.id,
				title: items.title,
				updatedAt: items.updatedAt,
				availability: items.availability,
				imageUrl: items.imageUrl,
				url: items.url,
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
					eq(items.isArchived, false),
					isNotNull(items.url),
					isNull(items.price)
				)
			)
			.limit(ctx.candidateCap)

		const loadStep: AnalyzerStep = { name: 'load-candidates', latencyMs: Date.now() - t0 }
		const inputHash = sha256Hex(
			`missing-price|${candidates
				.map(c => String(c.itemId))
				.sort()
				.join(',')}`
		)

		if (candidates.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: combineHashes([inputHash]) }
		}

		const recs: Array<AnalyzerRecOutput> = candidates.map(c => buildRec(c, ctx.subject))
		return { recs, steps: [loadStep], inputHash: combineHashes([inputHash]) }
	},
}

type CandidateRow = {
	itemId: number
	title: string
	updatedAt: Date
	availability: 'available' | 'unavailable'
	imageUrl: string | null
	url: string | null
	listId: number
	listName: string
	listType: string
	listIsPrivate: boolean
}

function buildRec(row: CandidateRow, subject: AnalyzerSubject): AnalyzerRecOutput {
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
	return {
		kind: 'missing-price',
		severity: 'info',
		title: `Add a price to ${row.title}`,
		body: 'This item has a link but no price. Filling one in helps gifters budget and surfaces it on price-filtered views.',
		actions: [
			{
				label: 'Add price',
				description: 'Open the edit dialog for this item so you can fill in the price.',
				intent: 'do',
				nav: { listId: String(row.listId), itemId: String(row.itemId), openEdit: true },
			},
		],
		dismissDescription: "Hide this suggestion. We won't surface it again unless this item changes.",
		affected: {
			noun: 'item',
			count: 1,
			lines: [`${row.title} · on ${row.listName}`],
			listChips: [listRef],
		},
		relatedItems: [itemRef],
		relatedLists: [listRef],
		fingerprintTargets: [String(row.itemId)],
	}
}
