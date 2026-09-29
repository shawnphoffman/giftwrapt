import { and, eq, inArray, isNull, ne } from 'drizzle-orm'

import type { Database } from '@/db'
import { intelligenceVerdicts, itemGroups, items, lists, recommendations } from '@/db/schema'
import { visibleItemsWhere } from '@/lib/item-visibility'

import { composeForLog, generateObjectCached } from '../ai-call'
import type { Analyzer } from '../analyzer'
import type { AnalyzerSubject } from '../context'
import { fingerprintFor } from '../fingerprint'
import { combineHashes, sha256Hex } from '../hash'
import {
	buildGroupingUserPrompt,
	GROUPING_MAX_CLUSTER_SIZE,
	GROUPING_MAX_LIST_ITEMS,
	GROUPING_MAX_SUGGESTIONS,
	GROUPING_SYSTEM,
	type GroupingListCandidate,
	groupingResponseSchema,
} from '../prompts/grouping'
import type { AnalyzerRecOutput, AnalyzerResult, AnalyzerStep, ItemRef, ListRef } from '../types'

// Safety bound on rows loaded per scope; far above any real user.
const MAX_ROWS = 5000
// Lists judged by the model concurrently.
const MODEL_CONCURRENCY = 3

type GroupDecision = 'or' | 'order'

type Row = {
	itemId: number
	title: string
	priority: 'very-high' | 'high' | 'normal' | 'low'
	imageUrl: string | null
	updatedAt: Date
	availability: 'available' | 'unavailable'
	groupId: number | null
	groupSortOrder: number | null
	groupType: GroupDecision | null
	listId: number
	listName: string
	listType: string
	listIsPrivate: boolean
}

type ExistingGroup = { id: number; type: GroupDecision; members: Array<Row> }

type ListCandidate = {
	listId: number
	listName: string
	// Ungrouped items sent to the model (all of them, or the heuristic's
	// picks when the list is longer than GROUPING_MAX_LIST_ITEMS).
	items: Array<Row>
	groups: Array<ExistingGroup>
	key: string
}

type ResolvedSuggestion =
	| { action: 'new'; groupType: GroupDecision; rows: Array<Row>; rationale: string }
	| { action: 'add'; group: ExistingGroup; rows: Array<Row>; rationale: string }

// Detect "or" / "order" item groups on the user's lists, and ungrouped
// items that belong in an existing group. Each list goes to the model
// whole (existing groups + ungrouped items), because lexical clustering
// misses most real groups ("PS5" + "PS5 Controllers", three differently
// named bikes). The model never sees claim data, and the analyzer never
// modifies state - it just emits suggestions the user can apply.
export const groupingAnalyzer: Analyzer = {
	id: 'grouping',
	label: 'Grouping',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()

		const rows: Array<Row> = await ctx.db
			.select({
				itemId: items.id,
				title: items.title,
				priority: items.priority,
				imageUrl: items.imageUrl,
				updatedAt: items.updatedAt,
				availability: items.availability,
				groupId: items.groupId,
				groupSortOrder: items.groupSortOrder,
				groupType: itemGroups.type,
				listId: lists.id,
				listName: lists.name,
				listType: lists.type,
				listIsPrivate: lists.isPrivate,
			})
			.from(items)
			.innerJoin(lists, eq(items.listId, lists.id))
			.leftJoin(itemGroups, eq(items.groupId, itemGroups.id))
			.where(
				and(
					eq(lists.ownerId, ctx.userId),
					ctx.dependentId === null ? isNull(lists.subjectDependentId) : eq(lists.subjectDependentId, ctx.dependentId),
					eq(lists.isActive, true),
					ne(lists.type, 'giftideas'),
					ne(lists.type, 'todos'),
					visibleItemsWhere('visible')
				)
			)
			.orderBy(items.id)
			.limit(MAX_ROWS)

		const loadStep: AnalyzerStep = { name: 'load-items', latencyMs: Date.now() - t0 }

		const candidates = buildListCandidates(rows)

		// Item ids participate (not just the title-only verdict keys)
		// because the emitted recs reference ids.
		const finalInputHash = combineHashes([
			sha256Hex(
				`grouping-list|${candidates
					.map(c => `${c.key}:${c.items.map(r => r.itemId).join('-')}`)
					.sort()
					.join(',')}`
			),
		])

		// Skip-before-call: identical candidate slate to the prior
		// successful run - bail before any model work; the runner keeps
		// this scope's existing recs.
		if (!ctx.dryRun && ctx.priorInputHash != null && ctx.priorInputHash === finalInputHash) {
			return { recs: [], steps: [loadStep], inputHash: finalInputHash, unchanged: true }
		}

		if (candidates.length === 0) {
			return { recs: [], steps: [loadStep], inputHash: finalInputHash }
		}

		const steps: Array<AnalyzerStep> = [loadStep]
		const resolved: Array<{ candidate: ListCandidate; suggestions: Array<ResolvedSuggestion> }> = []

		// Verdict cache: lists whose exact contents were already judged
		// replay the stored suggestions; only changed lists go to the model.
		const cacheStart = Date.now()
		const cachedVerdicts = await loadListVerdicts(
			ctx.db,
			ctx.userId,
			candidates.map(c => c.key)
		)
		const misses: Array<ListCandidate> = []
		for (const candidate of candidates) {
			const verdict = cachedVerdicts.get(candidate.key)
			const suggestions = verdict ? resolveStoredVerdict(verdict, candidate) : null
			if (suggestions) resolved.push({ candidate, suggestions })
			else misses.push(candidate)
		}
		steps.push({
			name: 'grouping:verdict-cache',
			parsed: { lists: candidates.length, hits: candidates.length - misses.length, misses: misses.length },
			latencyMs: Date.now() - cacheStart,
		})

		// Heuristic alone is too noisy to surface without a model to
		// confirm, so with no model only cached verdicts produce recs.
		const model = ctx.model
		if (model) {
			const toAsk = misses.slice(0, ctx.candidateCap)
			const verdictsToStore: Array<{ key: string; verdict: ListVerdict }> = []
			for (let i = 0; i < toAsk.length; i += MODEL_CONCURRENCY) {
				const batch = toAsk.slice(i, i + MODEL_CONCURRENCY)
				const results = await Promise.all(batch.map(candidate => judgeList(model, candidate)))
				for (let j = 0; j < batch.length; j++) {
					const { step, suggestions } = results[j]
					steps.push(step)
					if (!suggestions) continue
					resolved.push({ candidate: batch[j], suggestions })
					verdictsToStore.push({ key: batch[j].key, verdict: toStoredVerdict(suggestions) })
				}
			}
			if (!ctx.dryRun && verdictsToStore.length > 0) {
				await storeListVerdicts(ctx.db, ctx.userId, verdictsToStore, modelNameOf(model))
			}
		}

		const allRecs = resolved.flatMap(({ candidate, suggestions }) =>
			suggestions.map(s =>
				s.action === 'new'
					? buildGroupRec(s.rows, candidate.listId, candidate.listName, s.groupType, s.rationale, ctx.subject)
					: buildAddToGroupRec(s.rows, s.group, candidate.listId, candidate.listName, s.rationale, ctx.subject)
			)
		)
		return { recs: await capFreshRecs(ctx.db, ctx.userId, ctx.dependentId, allRecs), steps, inputHash: finalInputHash }
	},
}

// ─── Candidate building ─────────────────────────────────────────────────────

function buildListCandidates(rows: ReadonlyArray<Row>): Array<ListCandidate> {
	const byList = new Map<number, Array<Row>>()
	for (const row of rows) {
		const arr = byList.get(row.listId) ?? []
		arr.push(row)
		byList.set(row.listId, arr)
	}

	const candidates: Array<ListCandidate> = []
	for (const [listId, listRows] of byList) {
		const ungrouped = listRows.filter(r => r.groupId === null)
		const groupsById = new Map<number, ExistingGroup>()
		for (const row of listRows) {
			if (row.groupId === null || row.groupType === null) continue
			const group = groupsById.get(row.groupId) ?? { id: row.groupId, type: row.groupType, members: [] }
			group.members.push(row)
			groupsById.set(row.groupId, group)
		}
		const groups = [...groupsById.values()].sort((a, b) => a.id - b.id)
		for (const group of groups) {
			group.members.sort(
				(a, b) => (a.groupSortOrder ?? Number.MAX_SAFE_INTEGER) - (b.groupSortOrder ?? Number.MAX_SAFE_INTEGER) || a.itemId - b.itemId
			)
		}

		let candidateItems = ungrouped
		if (ungrouped.length > GROUPING_MAX_LIST_ITEMS) {
			// Too long to send whole: fall back to the lexical heuristic to
			// pick the items most likely to group.
			const clustered = new Set(buildClustersForList(ungrouped).flatMap(c => c.map(r => r.itemId)))
			candidateItems = ungrouped.filter(r => clustered.has(r.itemId)).slice(0, GROUPING_MAX_LIST_ITEMS)
		}
		if (candidateItems.length === 0) continue
		if (candidateItems.length < 2 && groups.length === 0) continue

		candidates.push({
			listId,
			listName: listRows[0].listName,
			items: candidateItems,
			groups,
			key: listVerdictKey(candidateItems, groups),
		})
	}
	return candidates
}

// ─── Model call + response validation ───────────────────────────────────────

async function judgeList(
	model: NonNullable<Parameters<Analyzer['run']>[0]['model']>,
	candidate: ListCandidate
): Promise<{ step: AnalyzerStep; suggestions: Array<ResolvedSuggestion> | null }> {
	const promptList: GroupingListCandidate = {
		listName: candidate.listName,
		groups: candidate.groups.map(g => ({ groupId: String(g.id), type: g.type, titles: g.members.map(m => m.title) })),
		items: candidate.items.map(r => ({ itemId: String(r.itemId), title: r.title })),
	}
	const userPrompt = buildGroupingUserPrompt(promptList)
	const start = Date.now()
	try {
		const result = await generateObjectCached({ model, schema: groupingResponseSchema, system: GROUPING_SYSTEM, prompt: userPrompt })
		return {
			step: {
				name: 'grouping',
				prompt: composeForLog(GROUPING_SYSTEM, userPrompt),
				responseRaw: JSON.stringify(result.object),
				parsed: result.object,
				tokensIn: result.usage.inputTokens,
				tokensOut: result.usage.outputTokens,
				cachedInputTokens: result.usage.cachedInputTokens,
				latencyMs: Date.now() - start,
				error: null,
			},
			suggestions: validateSuggestions(result.object.suggestions, candidate),
		}
	} catch (err) {
		return {
			step: {
				name: 'grouping',
				prompt: composeForLog(GROUPING_SYSTEM, userPrompt),
				responseRaw: null,
				parsed: null,
				latencyMs: Date.now() - start,
				error: err instanceof Error ? err.message : String(err),
			},
			suggestions: null,
		}
	}
}

// Drops anything malformed: unknown ids, items already used by an earlier
// suggestion, "new" groups under two items, "add" to a group not on this
// list. An "add" takes the existing group's real type, whatever the model
// echoed.
export function validateSuggestions(
	raw: ReadonlyArray<{
		action: 'new' | 'add'
		groupType: GroupDecision
		groupId: string
		itemIds: ReadonlyArray<string>
		rationale: string
	}>,
	candidate: Pick<ListCandidate, 'items' | 'groups'>
): Array<ResolvedSuggestion> {
	const byId = new Map(candidate.items.map(r => [String(r.itemId), r]))
	const used = new Set<string>()
	const out: Array<ResolvedSuggestion> = []
	for (const s of raw) {
		const rows: Array<Row> = []
		for (const id of s.itemIds) {
			const row = byId.get(id)
			if (!row || used.has(id) || rows.includes(row)) continue
			rows.push(row)
		}
		if (s.action === 'new') {
			if (rows.length < 2) continue
			out.push({ action: 'new', groupType: s.groupType, rows, rationale: s.rationale })
		} else {
			const group = candidate.groups.find(g => String(g.id) === s.groupId)
			if (!group || rows.length === 0) continue
			out.push({ action: 'add', group, rows, rationale: s.rationale })
		}
		for (const row of rows) used.add(String(row.itemId))
	}
	return out
}

// ─── Verdict cache helpers ──────────────────────────────────────────────────

const LIST_VERDICT_KIND = 'grouping-list'

type StoredSuggestion = {
	action: 'new' | 'add'
	groupType: GroupDecision
	groupId: number | null
	items: Array<{ id: number; title: string }>
	rationale: string
}
type ListVerdict = { suggestions: Array<StoredSuggestion> }

export function normalizeTitle(title: string): string {
	return title.trim().toLowerCase().replace(/\s+/g, ' ')
}

// Key is a function of the list's ungrouped titles plus its existing
// groups (ids, types, ordered member titles): the judgment depends on
// that text only, so it survives item re-creation for ungrouped items.
// Any edit, add, or removal re-keys the list and re-asks the model.
export function listVerdictKey(
	ungrouped: ReadonlyArray<{ title: string }>,
	groups: ReadonlyArray<{ id: number; type: GroupDecision; members: ReadonlyArray<{ title: string }> }>
): string {
	const groupPart = groups.map(g => `${g.id}:${g.type}:${g.members.map(m => normalizeTitle(m.title)).join('>')}`).join('|')
	const itemPart = ungrouped
		.map(r => normalizeTitle(r.title))
		.sort()
		.join('|')
	return sha256Hex(`group-list|${groupPart}||${itemPart}`)
}

function toStoredVerdict(suggestions: ReadonlyArray<ResolvedSuggestion>): ListVerdict {
	return {
		suggestions: suggestions.map(s => ({
			action: s.action,
			groupType: s.action === 'new' ? s.groupType : s.group.type,
			groupId: s.action === 'add' ? s.group.id : null,
			items: s.rows.map(r => ({ id: r.itemId, title: r.title })),
			rationale: s.rationale,
		})),
	}
}

// Replay a stored verdict onto the list's current rows. Items resolve by
// id when the id still carries the same title, else by a unique title
// match (the item was re-created). Returns null when anything can't be
// resolved, so the list falls through to a fresh model call.
function resolveStoredVerdict(verdict: ListVerdict, candidate: ListCandidate): Array<ResolvedSuggestion> | null {
	const byId = new Map(candidate.items.map(r => [r.itemId, r]))
	const byTitle = new Map<string, Array<Row>>()
	for (const row of candidate.items) {
		const key = normalizeTitle(row.title)
		byTitle.set(key, [...(byTitle.get(key) ?? []), row])
	}
	const out: Array<ResolvedSuggestion> = []
	for (const s of verdict.suggestions) {
		const rows: Array<Row> = []
		for (const item of s.items) {
			const idHit = byId.get(item.id)
			if (idHit && normalizeTitle(idHit.title) === normalizeTitle(item.title)) {
				rows.push(idHit)
				continue
			}
			const titleHits = byTitle.get(normalizeTitle(item.title)) ?? []
			if (titleHits.length !== 1) return null
			rows.push(titleHits[0])
		}
		if (s.action === 'new') {
			out.push({ action: 'new', groupType: s.groupType, rows, rationale: s.rationale })
		} else {
			const group = candidate.groups.find(g => g.id === s.groupId)
			if (!group) return null
			out.push({ action: 'add', group, rows, rationale: s.rationale })
		}
	}
	return out
}

async function loadListVerdicts(db: Database, userId: string, keys: Array<string>): Promise<Map<string, ListVerdict>> {
	if (keys.length === 0) return new Map()
	const rows = await db
		.select({ key: intelligenceVerdicts.key, verdict: intelligenceVerdicts.verdict })
		.from(intelligenceVerdicts)
		.where(
			and(
				eq(intelligenceVerdicts.userId, userId),
				eq(intelligenceVerdicts.kind, LIST_VERDICT_KIND),
				inArray(intelligenceVerdicts.key, keys)
			)
		)
	const map = new Map<string, ListVerdict>()
	for (const row of rows) {
		const v = row.verdict as Partial<ListVerdict>
		if (Array.isArray(v.suggestions)) map.set(row.key, { suggestions: v.suggestions })
	}
	return map
}

async function storeListVerdicts(
	db: Database,
	userId: string,
	entries: Array<{ key: string; verdict: ListVerdict }>,
	model: string | null
): Promise<void> {
	for (const entry of entries) {
		await db
			.insert(intelligenceVerdicts)
			.values({ userId, kind: LIST_VERDICT_KIND, key: entry.key, verdict: entry.verdict, model })
			.onConflictDoNothing()
	}
}

// Bound how many suggestions the user sees per run, counting only ones
// they haven't already acted on. Dismissed / applied recs are still
// emitted (the runner carries their status forward by fingerprint and
// they stay hidden), so dropping them here would forget the dismissal
// and resurface them next run.
async function capFreshRecs(
	db: Database,
	userId: string,
	dependentId: string | null,
	recs: ReadonlyArray<AnalyzerRecOutput>
): Promise<Array<AnalyzerRecOutput>> {
	if (recs.length === 0) return []
	const prior = await db
		.select({ fingerprint: recommendations.fingerprint })
		.from(recommendations)
		.where(
			and(
				eq(recommendations.userId, userId),
				eq(recommendations.analyzerId, 'grouping'),
				inArray(recommendations.status, ['dismissed', 'applied'])
			)
		)
	const resolvedFps = new Set(prior.map(p => p.fingerprint))
	const out: Array<AnalyzerRecOutput> = []
	let fresh = 0
	for (const rec of recs) {
		const fp = fingerprintFor({ analyzerId: 'grouping', kind: rec.kind, fingerprintTargets: rec.fingerprintTargets, dependentId })
		if (resolvedFps.has(fp)) out.push(rec)
		else if (fresh < GROUPING_MAX_SUGGESTIONS) {
			out.push(rec)
			fresh++
		}
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

type RecRow = {
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
}

function listRefFor(row: RecRow, listId: number, listName: string, subject: AnalyzerSubject): ListRef {
	const listSubject: ListRef['subject'] =
		subject.kind === 'dependent'
			? { kind: 'dependent', name: subject.name, image: subject.image }
			: { kind: 'user', name: subject.name, image: subject.image }
	return {
		id: String(listId),
		name: listName,
		type: row.listType as ListRef['type'],
		isPrivate: row.listIsPrivate,
		subject: listSubject,
	}
}

function itemRefFor(r: RecRow): ItemRef {
	return {
		id: String(r.itemId),
		title: r.title,
		listId: String(r.listId),
		listName: r.listName,
		imageUrl: r.imageUrl,
		updatedAt: r.updatedAt,
		availability: r.availability,
	}
}

function buildGroupRec(
	rows: ReadonlyArray<RecRow>,
	listId: number,
	listName: string,
	decision: 'or' | 'order',
	rationale: string,
	subject: AnalyzerSubject
): AnalyzerRecOutput {
	const listRef = listRefFor(rows[0], listId, listName, subject)
	const itemRefs: Array<ItemRef> = rows.map(itemRefFor)
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

function buildAddToGroupRec(
	rows: ReadonlyArray<RecRow>,
	group: { id: number; type: 'or' | 'order'; members: ReadonlyArray<RecRow> },
	listId: number,
	listName: string,
	rationale: string,
	subject: AnalyzerSubject
): AnalyzerRecOutput {
	const listRef = listRefFor(rows[0], listId, listName, subject)
	const itemIds = rows.map(r => String(r.itemId))
	const isOr = group.type === 'or'
	const noun = rows.length === 1 ? 'this' : 'these'

	return {
		kind: 'group-suggestion',
		severity: 'suggest',
		title: isOr ? `Add ${noun} to a "pick one" group` : `Add ${noun} to an ordered group`,
		body: rationale,
		actions: [
			{
				label: 'Add to Group',
				description: isOr
					? 'Claiming any item in the group locks the others. You can rearrange or split the group later.'
					: 'These go after the items already in the group. You can rearrange or split the group later.',
				intent: 'do',
				apply: { kind: 'add-to-group', listId: String(listId), groupId: String(group.id), itemIds },
			},
			{
				label: 'Keep separate',
				description: "These don't belong in that group. We won't suggest adding them again.",
				intent: 'noop',
			},
		],
		affected: {
			noun: 'items',
			count: rows.length,
			lines: [...rows.map(r => `${r.title} · add to group`), ...group.members.map(m => `${m.title} · already in group`)],
			listChips: [listRef],
		},
		relatedItems: [...rows, ...group.members].map(itemRefFor),
		relatedLists: [listRef],
		// The group id participates so "add X to group A" and a later "add
		// X to group B" never share a dismissal.
		fingerprintTargets: [`group:${group.id}`, ...itemIds],
	}
}
