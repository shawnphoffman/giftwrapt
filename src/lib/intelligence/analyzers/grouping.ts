import { and, eq, inArray, isNull, ne } from 'drizzle-orm'

import type { Database } from '@/db'
import { intelligenceVerdicts, items, lists } from '@/db/schema'
import { visibleItemsWhere } from '@/lib/item-visibility'

import { composeForLog, generateObjectCached } from '../ai-call'
import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { combineHashes, sha256Hex } from '../hash'
import {
	buildGroupingUserPrompt,
	GROUPING_MAX_CLUSTER_SIZE,
	GROUPING_MAX_SUGGESTIONS,
	GROUPING_SYSTEM,
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
					visibleItemsWhere('visible'),
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

		// Titles participate in the hash (not just ids) because the cached
		// verdicts and the model's judgment are functions of the text.
		const finalInputHash = combineHashes([
			sha256Hex(
				`grouping|${clusters
					.map(c =>
						c.rows
							.map(r => `${r.itemId}:${normalizeTitle(r.title)}`)
							.sort()
							.join('-')
					)
					.sort()
					.join(',')}`
			),
		])

		// Skip-before-call: identical cluster slate to the prior successful
		// run — bail before any model work; the runner keeps this scope's
		// existing recs.
		if (!ctx.dryRun && ctx.priorInputHash != null && ctx.priorInputHash === finalInputHash) {
			return { recs: [], steps: [loadStep], inputHash: finalInputHash, unchanged: true }
		}

		if (clusters.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: finalInputHash }
		}

		const steps: Array<AnalyzerStep> = [loadStep]
		const recs: Array<AnalyzerRecOutput> = []

		// Verdict cache: clusters whose member titles were already judged
		// keep their stored decision; only unseen clusters go to the model.
		const cacheStart = Date.now()
		const keyed = clusters.map(c => ({ cluster: c, key: clusterVerdictKey(c.rows.map(r => r.title)) }))
		const cachedVerdicts = await loadClusterVerdicts(
			ctx.db,
			ctx.userId,
			keyed.map(k => k.key)
		)
		const misses: Array<(typeof keyed)[number]> = []
		for (const entry of keyed) {
			const verdict = cachedVerdicts.get(entry.key)
			if (!verdict) {
				misses.push(entry)
				continue
			}
			if (verdict.decision === 'skip') continue
			const orderedRows = mapTitlesToRows(verdict.orderedTitles, entry.cluster.rows)
			if (!orderedRows || orderedRows.length < 2) continue
			recs.push(buildGroupRec(orderedRows, entry.cluster.listId, entry.cluster.listName, verdict.decision, verdict.rationale, ctx.subject))
		}
		steps.push({
			name: 'grouping:verdict-cache',
			parsed: { clusters: keyed.length, hits: keyed.length - misses.length, misses: misses.length },
			latencyMs: Date.now() - cacheStart,
		})

		// Heuristic alone is too noisy: shared tokens / brand prefixes flag
		// plenty of pairs that aren't truly grouping candidates. Without a
		// model to confirm, we only surface what the verdict cache already
		// confirmed.
		if (!ctx.model || misses.length === 0) {
			return { recs: recs.slice(0, GROUPING_MAX_SUGGESTIONS), steps, inputHash: finalInputHash }
		}

		const promptClusters: Array<GroupingClusterCandidate> = misses.map(m => ({
			listId: String(m.cluster.listId),
			listName: m.cluster.listName,
			items: m.cluster.rows.map(r => ({ itemId: String(r.itemId), title: r.title })),
		}))
		const userPrompt = buildGroupingUserPrompt({ clusters: promptClusters })

		const stepStart = Date.now()
		let parsed: unknown = null
		let responseRaw: string | null = null
		let error: string | null = null
		let tokensIn = 0
		let tokensOut = 0
		let cachedInputTokens = 0
		try {
			const result = await generateObjectCached({
				model: ctx.model,
				schema: groupingResponseSchema,
				system: GROUPING_SYSTEM,
				prompt: userPrompt,
			})
			parsed = result.object
			responseRaw = JSON.stringify(result.object)
			tokensIn = result.usage.inputTokens
			tokensOut = result.usage.outputTokens
			cachedInputTokens = result.usage.cachedInputTokens
		} catch (err) {
			error = err instanceof Error ? err.message : String(err)
		}
		steps.push({
			name: 'grouping',
			prompt: composeForLog(GROUPING_SYSTEM, userPrompt),
			responseRaw,
			parsed,
			tokensIn,
			tokensOut,
			cachedInputTokens,
			latencyMs: Date.now() - stepStart,
			error,
		})

		if (error || !parsed) {
			return { recs: recs.slice(0, GROUPING_MAX_SUGGESTIONS), steps, inputHash: finalInputHash }
		}

		// Consume the full parsed list for the verdict cache (so a big
		// response still memoizes every judgment), but bound how many fresh
		// group recs one run can add.
		const aiGroups = (
			parsed as { groups: Array<{ clusterIndex: number; decision: 'or' | 'order' | 'skip'; itemIds: Array<string>; rationale: string }> }
		).groups
		const echoedIndexes = new Set<number>()
		const verdictsToStore: Array<{ key: string; verdict: ClusterVerdict }> = []
		let freshRecs = 0

		for (const group of aiGroups) {
			const idx = group.clusterIndex - 1
			if (idx < 0 || idx >= misses.length) continue
			echoedIndexes.add(idx)
			const { cluster, key } = misses[idx]
			const allowedIds = new Set(cluster.rows.map(r => String(r.itemId)))
			const validMembers = group.decision !== 'skip' && group.itemIds.length >= 2 && group.itemIds.every(id => allowedIds.has(id))
			if (!validMembers) {
				verdictsToStore.push({ key, verdict: { decision: 'skip', orderedTitles: [], rationale: '' } })
				continue
			}
			const orderedRows: Array<Row> = []
			for (const id of group.itemIds) {
				const row = cluster.rows.find(r => String(r.itemId) === id)
				if (row) orderedRows.push(row)
			}
			if (orderedRows.length < 2) {
				verdictsToStore.push({ key, verdict: { decision: 'skip', orderedTitles: [], rationale: '' } })
				continue
			}
			verdictsToStore.push({
				key,
				verdict: { decision: group.decision as 'or' | 'order', orderedTitles: orderedRows.map(r => r.title), rationale: group.rationale },
			})
			if (freshRecs < GROUPING_MAX_SUGGESTIONS) {
				recs.push(
					buildGroupRec(orderedRows, cluster.listId, cluster.listName, group.decision as 'or' | 'order', group.rationale, ctx.subject)
				)
				freshRecs++
			}
		}

		// Clusters the model didn't echo back get a negative verdict so we
		// don't re-ask about the same titles forever. A title edit changes
		// the key, so a wrongly-negative verdict heals on the next edit or
		// when the row ages out of retention.
		for (let i = 0; i < misses.length; i++) {
			if (echoedIndexes.has(i)) continue
			verdictsToStore.push({ key: misses[i].key, verdict: { decision: 'skip', orderedTitles: [], rationale: '' } })
		}
		if (!ctx.dryRun && verdictsToStore.length > 0) {
			await storeClusterVerdicts(ctx.db, ctx.userId, verdictsToStore, modelNameOf(ctx.model))
		}

		return { recs: recs.slice(0, GROUPING_MAX_SUGGESTIONS), steps, inputHash: finalInputHash }
	},
}

// ─── Verdict cache helpers ──────────────────────────────────────────────────

const CLUSTER_VERDICT_KIND = 'grouping-cluster'

type ClusterVerdict = { decision: 'or' | 'order' | 'skip'; orderedTitles: Array<string>; rationale: string }

export function normalizeTitle(title: string): string {
	return title.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Key is a function of the member titles only: the judgment ("are these
// alternates / a sequence / unrelated?") doesn't depend on ids or list
// names, so it survives item re-creation and list moves.
export function clusterVerdictKey(titles: ReadonlyArray<string>): string {
	return sha256Hex(`group-cluster|${titles.map(normalizeTitle).sort().join('|')}`)
}

async function loadClusterVerdicts(db: Database, userId: string, keys: Array<string>): Promise<Map<string, ClusterVerdict>> {
	if (keys.length === 0) return new Map()
	const rows = await db
		.select({ key: intelligenceVerdicts.key, verdict: intelligenceVerdicts.verdict })
		.from(intelligenceVerdicts)
		.where(
			and(
				eq(intelligenceVerdicts.userId, userId),
				eq(intelligenceVerdicts.kind, CLUSTER_VERDICT_KIND),
				inArray(intelligenceVerdicts.key, keys)
			)
		)
	const map = new Map<string, ClusterVerdict>()
	for (const row of rows) {
		const v = row.verdict as Partial<ClusterVerdict>
		if (v.decision === 'or' || v.decision === 'order' || v.decision === 'skip') {
			map.set(row.key, {
				decision: v.decision,
				orderedTitles: Array.isArray(v.orderedTitles) ? v.orderedTitles : [],
				rationale: typeof v.rationale === 'string' ? v.rationale : '',
			})
		}
	}
	return map
}

async function storeClusterVerdicts(
	db: Database,
	userId: string,
	entries: Array<{ key: string; verdict: ClusterVerdict }>,
	model: string | null
): Promise<void> {
	for (const entry of entries) {
		await db
			.insert(intelligenceVerdicts)
			.values({ userId, kind: CLUSTER_VERDICT_KIND, key: entry.key, verdict: entry.verdict, model })
			.onConflictDoNothing()
	}
}

// Resolve a cached verdict's ordered member titles back onto the current
// cluster rows. Bails (returns null) when any title is missing or
// ambiguous (duplicate titles in the cluster) — the cluster then falls
// through as a miss on the next run rather than emitting a wrong group.
function mapTitlesToRows<TRow extends { title: string }>(titles: ReadonlyArray<string>, rows: ReadonlyArray<TRow>): Array<TRow> | null {
	const byTitle = new Map<string, Array<TRow>>()
	for (const row of rows) {
		const key = normalizeTitle(row.title)
		const arr = byTitle.get(key) ?? []
		arr.push(row)
		byTitle.set(key, arr)
	}
	const out: Array<TRow> = []
	for (const title of titles) {
		const matches = byTitle.get(normalizeTitle(title))
		if (!matches || matches.length !== 1) return null
		out.push(matches[0])
	}
	return out
}

export function modelNameOf(model: unknown): string | null {
	if (model && typeof model === 'object' && 'modelId' in model && typeof (model as { modelId: unknown }).modelId === 'string') {
		return (model as { modelId: string }).modelId
	}
	return null
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
