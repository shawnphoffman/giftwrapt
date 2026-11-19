import { and, eq, isNotNull, isNull, ne } from 'drizzle-orm'

import { items, lists } from '@/db/schema'
import type { Locale } from '@/lib/i18n/locales'
import { visibleItemsWhere } from '@/lib/item-visibility'
import { m } from '@/paraglide/messages.js'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ListRef, RecSubItem } from '../types'

// Heuristic-only: surfaces items the user added a URL to but never filled in
// a price for. Bundled per list: one rec per (list, this analyzer kind),
// with each item rendered as a sub-row in the rec card. Skipping a sub-row
// hides just that item; dismissing the bundle hides the whole list's
// recommendation. See ../coerce-legacy-action.ts for the legacy per-item
// rec shape that this replaces - old rows cycle out at the next regen.
export const missingPriceAnalyzer: Analyzer = {
	id: 'missing-price',
	label: () => m.admin_intel_analyzer_missing_price_label(),
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
					ne(lists.type, 'todos'),
					visibleItemsWhere('visible'),
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

		const recs = buildBundles(candidates, ctx.subject, ctx.locale)
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

function buildBundles(rows: ReadonlyArray<CandidateRow>, subject: AnalyzerSubject, locale: Locale): Array<AnalyzerRecOutput> {
	const o = { locale }
	const byList = new Map<number, Array<CandidateRow>>()
	for (const row of rows) {
		const arr = byList.get(row.listId) ?? []
		arr.push(row)
		byList.set(row.listId, arr)
	}
	const recs: Array<AnalyzerRecOutput> = []
	for (const [, listRows] of byList) {
		listRows.sort((a, b) => a.title.localeCompare(b.title))
		const first = listRows[0]
		const listRef = makeListRef(first, subject)
		const subItems: Array<RecSubItem> = listRows.map(c => ({
			id: String(c.itemId),
			title: c.title,
			thumbnailUrl: c.imageUrl,
			nav: { listId: String(c.listId), itemId: String(c.itemId), openEdit: true },
		}))
		const count = subItems.length
		recs.push({
			kind: 'missing-price',
			severity: 'info',
			title: m.intel_missing_price_title({ count, listName: first.listName }, o),
			body: m.intel_missing_price_body({ count }, o),
			actions: [],
			dismissDescription: m.intel_common_dismiss_list_bundle({}, o),
			affected: {
				noun: count === 1 ? m.intel_common_noun_item({}, o) : m.intel_common_noun_items({}, o),
				count,
				lines: [m.intel_missing_price_line({ count, listName: first.listName }, o)],
				listChips: [listRef],
			},
			relatedLists: [listRef],
			// listRef is intentionally in fingerprintTargets so the
			// fingerprint is (analyzerId, kind, listId): adding/removing
			// items from the bundle does NOT churn the fingerprint, so
			// sub-item dismissals stay sticky across regenerations.
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
