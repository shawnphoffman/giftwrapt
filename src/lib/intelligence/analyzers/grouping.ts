import { generateObject } from 'ai'
import { and, eq, isNull, ne } from 'drizzle-orm'

import { items, lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import {
	buildGroupingPrompt,
	GROUPING_MAX_CLUSTER_SIZE,
	GROUPING_MAX_SUGGESTIONS,
	type GroupingClusterCandidate,
	groupingResponseSchema,
} from '../prompts/grouping'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef } from '../types'

// Detect candidate "or" / "order" item groups on the user's lists.
// Heuristic clusters items by shared tokens + brand-prefix sequences, then
// the model decides whether each cluster is a real group. The model
// never sees claim data, and the analyzer never modifies state - it just
// emits suggestions that the user can apply via the rec card.
export const groupingAnalyzer: Analyzer = {
	id: 'grouping',
	label: 'Grouping',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()

		const rows = await ctx.db
			.select({
				itemId: items.id,
				title: items.title,
				priority: items.priority,
				imageUrl: items.imageUrl,
				updatedAt: items.updatedAt,
				availability: items.availability,
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
					isNull(items.pendingDeletionAt),
					isNull(items.groupId)
				)
			)
			.limit(ctx.candidateCap * 6)

		const loadStep: AnalyzerStep = { name: 'load-items', latencyMs: Date.now() - t0 }

		type Row = (typeof rows)[number]
		const byList = new Map<number, Array<Row>>()
		for (const row of rows) {
			const arr = byList.get(row.listId) ?? []
			arr.push(row)
			byList.set(row.listId, arr)
		}

		const clusters: Array<{ rows: Array<Row>; listId: number; listName: string }> = []
		for (const [listId, listRows] of byList) {
			if (listRows.length < 2) continue
			const listName = listRows[0].listName
			for (const cluster of buildClustersForList(listRows)) {
				clusters.push({ rows: cluster, listId, listName })
				if (clusters.length >= ctx.candidateCap) break
			}
			if (clusters.length >= ctx.candidateCap) break
		}

		const inputHash = sha256Hex(
			`grouping|${clusters
				.map(c =>
					c.rows
						.map(r => r.itemId)
						.sort()
						.join('-')
				)
				.sort()
				.join(',')}`
		)

		if (clusters.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: combineHashes([inputHash]) }
		}

		const steps: Array<AnalyzerStep> = [loadStep]
		const recs: Array<AnalyzerRecOutput> = []

		// Heuristic alone is too noisy: shared tokens / brand prefixes flag
		// plenty of pairs that aren't truly grouping candidates. Without a
		// model to confirm, we don't surface anything to the user.
		if (!ctx.model) {
			return { recs, steps, inputHash: combineHashes([inputHash]) }
		}

		const promptClusters: Array<GroupingClusterCandidate> = clusters.map(c => ({
			listId: String(c.listId),
			listName: c.listName,
			items: c.rows.map(r => ({ itemId: String(r.itemId), title: r.title })),
		}))
		const prompt = buildGroupingPrompt({ clusters: promptClusters })

		const stepStart = Date.now()
		let parsed: unknown = null
		let responseRaw: string | null = null
		let error: string | null = null
		let tokensIn = 0
		let tokensOut = 0
		try {
			const result = await generateObject({
				model: ctx.model,
				schema: groupingResponseSchema,
				prompt,
			})
			parsed = result.object
			responseRaw = JSON.stringify(result.object)
			tokensIn = result.usage.inputTokens ?? 0
			tokensOut = result.usage.outputTokens ?? 0
		} catch (err) {
			error = err instanceof Error ? err.message : String(err)
		}
		steps.push({ name: 'grouping', prompt, responseRaw, parsed, tokensIn, tokensOut, latencyMs: Date.now() - stepStart, error })

		if (error || !parsed) {
			return { recs, steps, inputHash: combineHashes([inputHash]) }
		}

		const aiGroups = (
			parsed as { groups: Array<{ clusterIndex: number; decision: 'or' | 'order' | 'skip'; itemIds: Array<string>; rationale: string }> }
		).groups.slice(0, GROUPING_MAX_SUGGESTIONS)

		for (const group of aiGroups) {
			if (group.decision === 'skip') continue
			if (group.itemIds.length < 2) continue
			const idx = group.clusterIndex - 1
			if (idx < 0 || idx >= clusters.length) continue
			const cluster = clusters[idx]
			const allowedIds = new Set(cluster.rows.map(r => String(r.itemId)))
			if (!group.itemIds.every(id => allowedIds.has(id))) continue
			const orderedRows: Array<Row> = []
			for (const id of group.itemIds) {
				const row = cluster.rows.find(r => String(r.itemId) === id)
				if (row) orderedRows.push(row)
			}
			if (orderedRows.length < 2) continue
			recs.push(buildGroupRec(orderedRows, cluster.listId, cluster.listName, group.decision, group.rationale, ctx.subject))
		}

		return { recs, steps, inputHash: combineHashes([inputHash]) }
	},
}

// Stopwords are intentionally narrow - articles, prepositions, copulas.
// Product-bearing tokens like "set", "pack", "small", "large" stay in
// because they're often the differentiator that defines a group
// ("Lego Set 1", "Lego Set 2"; "T-shirt small", "T-shirt large").
const STOPWORDS = new Set([
	'a',
	'an',
	'and',
	'are',
	'as',
	'at',
	'be',
	'by',
	'for',
	'from',
	'has',
	'have',
	'in',
	'is',
	'it',
	'its',
	'of',
	'on',
	'or',
	'the',
	'to',
	'with',
])

function tokenize(s: string): Array<string> {
	return s
		.toLowerCase()
		.replace(/[^a-z0-9 ]+/g, ' ')
		.split(/\s+/)
		.filter(t => t.length > 1 && !STOPWORDS.has(t))
}

type ClusterRow = { itemId: number; title: string }

// Build candidate clusters from a list's ungrouped items. Two passes:
// (1) brand-prefix sequence: same first-2-tokens with at least one
// numeric-suffix differentiator; (2) shared-token: items sharing >=2
// non-stopword tokens.
//
// Each item lands in at most one cluster (first-pass wins). Clusters are
// capped at GROUPING_MAX_CLUSTER_SIZE.
export function buildClustersForList<TRow extends ClusterRow>(rows: ReadonlyArray<TRow>): Array<Array<TRow>> {
	if (rows.length < 2) return []
	const claimed = new Set<number>()
	const clusters: Array<Array<TRow>> = []

	// Pass 1: brand-prefix sequence (shared first-2 tokens, one differs by number).
	type PrefixBucket = { rows: Array<TRow>; hasNumericVariant: boolean }
	const byPrefix = new Map<string, PrefixBucket>()
	for (const row of rows) {
		const tokens = tokenize(row.title)
		if (tokens.length < 2) continue
		const prefix = `${tokens[0]} ${tokens[1]}`
		const bucket = byPrefix.get(prefix) ?? { rows: [], hasNumericVariant: false }
		bucket.rows.push(row)
		if (tokens.slice(2).some(isNumericLike)) bucket.hasNumericVariant = true
		byPrefix.set(prefix, bucket)
	}
	for (const bucket of byPrefix.values()) {
		if (bucket.rows.length < 2 || !bucket.hasNumericVariant) continue
		const cluster = bucket.rows.slice(0, GROUPING_MAX_CLUSTER_SIZE)
		clusters.push(cluster)
		for (const r of cluster) claimed.add(r.itemId)
	}

	// Pass 2: shared-token clustering on the leftovers. Build an
	// index from token -> rows; greedily form a cluster per anchor row.
	const remaining = rows.filter(r => !claimed.has(r.itemId))
	const tokenIndex = new Map<string, Array<TRow>>()
	for (const row of remaining) {
		for (const tok of tokenize(row.title)) {
			const arr = tokenIndex.get(tok) ?? []
			arr.push(row)
			tokenIndex.set(tok, arr)
		}
	}
	for (const anchor of remaining) {
		if (claimed.has(anchor.itemId)) continue
		const anchorTokens = new Set(tokenize(anchor.title))
		if (anchorTokens.size === 0) continue
		const candidates = new Map<number, { row: TRow; shared: number }>()
		for (const tok of anchorTokens) {
			for (const peer of tokenIndex.get(tok) ?? []) {
				if (peer.itemId === anchor.itemId || claimed.has(peer.itemId)) continue
				const entry = candidates.get(peer.itemId) ?? { row: peer, shared: 0 }
				entry.shared += 1
				candidates.set(peer.itemId, entry)
			}
		}
		const peers = [...candidates.values()].filter(c => c.shared >= 2).sort((a, b) => b.shared - a.shared)
		if (peers.length === 0) continue
		const cluster = [anchor, ...peers.slice(0, GROUPING_MAX_CLUSTER_SIZE - 1).map(p => p.row)]
		clusters.push(cluster)
		for (const r of cluster) claimed.add(r.itemId)
	}

	return clusters
}

function isNumericLike(s: string): boolean {
	return /\d/.test(s)
}

const PRIORITY_RANK: Record<'very-high' | 'high' | 'normal' | 'low', number> = {
	'very-high': 3,
	high: 2,
	normal: 1,
	low: 0,
}

export function pickGroupPriority(
	priorities: ReadonlyArray<'very-high' | 'high' | 'normal' | 'low'>
): 'very-high' | 'high' | 'normal' | 'low' {
	if (priorities.length === 0) return 'normal'
	let best = priorities[0]
	for (const p of priorities) {
		if (PRIORITY_RANK[p] > PRIORITY_RANK[best]) best = p
	}
	return best
}

function buildGroupRec<
	TRow extends {
		itemId: number
		title: string
		priority: 'very-high' | 'high' | 'normal' | 'low'
		imageUrl: string | null
		updatedAt: Date
		availability: 'available' | 'unavailable'
		listId: number
		listName: string
		listType: string
		listIsPrivate: boolean
	},
>(
	rows: ReadonlyArray<TRow>,
	listId: number,
	listName: string,
	decision: 'or' | 'order',
	rationale: string,
	subject: AnalyzerSubject
): AnalyzerRecOutput {
	const listSubject: ListRef['subject'] =
		subject.kind === 'dependent'
			? { kind: 'dependent', name: subject.name, image: subject.image }
			: { kind: 'user', name: subject.name, image: subject.image }
	const listRef: ListRef = {
		id: String(listId),
		name: listName,
		type: rows[0].listType as ListRef['type'],
		isPrivate: rows[0].listIsPrivate,
		subject: listSubject,
	}
	const itemRefs: Array<ItemRef> = rows.map(r => ({
		id: String(r.itemId),
		title: r.title,
		listId: String(r.listId),
		listName: r.listName,
		imageUrl: r.imageUrl,
		updatedAt: r.updatedAt,
		availability: r.availability,
	}))
	const priority = pickGroupPriority(rows.map(r => r.priority))
	const itemIds = rows.map(r => String(r.itemId))

	const isOr = decision === 'or'
	const title = isOr ? 'Group these as "pick one"' : 'Group these in order'
	const applyLabel = isOr ? 'Group as Pick One' : 'Group in Order'
	const applyDescription = isOr
		? 'Claiming one will lock the others. You can rearrange or split the group later.'
		: 'Earlier items must be claimed before later ones. You can rearrange or split the group later.'

	return {
		kind: 'group-suggestion',
		severity: 'suggest',
		title,
		body: rationale,
		actions: [
			{
				label: applyLabel,
				description: applyDescription,
				intent: 'do',
				apply: { kind: 'create-group', listId: String(listId), groupType: decision, itemIds, priority },
			},
			{
				label: 'Keep separate',
				description: "These aren't really a set. We won't suggest grouping them again.",
				intent: 'noop',
			},
		],
		affected: {
			noun: 'items',
			count: rows.length,
			lines: rows.map(r => `${r.title} · on ${r.listName}`),
			listChips: [listRef],
		},
		relatedItems: itemRefs,
		relatedLists: [listRef],
		// Sort the targets so order doesn't change the fingerprint - the
		// helper sorts before hashing too, but mirroring duplicates.ts.
		fingerprintTargets: itemIds,
	}
}
