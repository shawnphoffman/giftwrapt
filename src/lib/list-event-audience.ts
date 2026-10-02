/**
 * Who may receive a `ListEvent` over SSE.
 *
 * Events carry ids only, but delivery itself is information: a recipient who
 * sees `{ kind: 'claim', listId: <their list> }` arrive learns that someone
 * just bought them something. So every subscriber is checked against the
 * list before an event is written to it, on both channels:
 *
 *   - The subscriber must pass the same predicate as the list's read paths:
 *     the gifter view (`canViewListAsAnyone`) or the edit view (`canEditList`).
 *   - The list's recipient never receives `claim` or `addon` events. Claims
 *     and off-list gifts are spoiler content until reveal, and the owner-side
 *     surfaces must not even refetch on them (that is a timing side channel).
 *
 * The per-list channel checks the predicate once at subscribe time; the
 * any-list channel checks it per event through `createListAudienceResolver`,
 * which caches each (viewer, list) decision briefly so a burst of events does
 * not turn into a burst of permission queries.
 */

import { eq } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { db as defaultDb } from '@/db'
import { lists } from '@/db/schema'
import { canEditList, canViewListAsAnyone } from '@/lib/permissions'

// Typed event taxonomy. Clients switch on `kind` and invalidate only the
// affected query. Payload carries no row data, only ids; restricted-viewer
// filtering still applies on the resulting refetch.
export type ListEvent =
	| { kind: 'claim'; listId: number }
	| { kind: 'item'; listId: number; itemId: number; shape?: 'added' | 'removed' }
	| { kind: 'comment'; listId: number; itemId: number; shape?: 'added' | 'removed' }
	| { kind: 'addon'; listId: number; addonId: number; shape?: 'added' | 'removed' }
	| { kind: 'list'; listId: number; shape?: 'added' | 'removed' | 'archived' }

export type ListForAudience = {
	id: number
	ownerId: string
	subjectDependentId: string | null
	isPrivate: boolean
	isActive: boolean
}

export type ListAudienceDecision = {
	/** Passes the gifter-view or edit-view predicate for the list. */
	canSubscribe: boolean
	/** Is the person the list's gifts are for. */
	isRecipient: boolean
}

const RECIPIENT_HIDDEN_KINDS: ReadonlySet<ListEvent['kind']> = new Set(['claim', 'addon'])

// The owner is the recipient unless the list is for a dependent, in which
// case the owner is a guardian and gifts to the dependent like anyone else.
// Same rule as the self-claim gate in claimItemGiftImpl.
export function isListRecipient(viewerId: string, list: Pick<ListForAudience, 'ownerId' | 'subjectDependentId'>): boolean {
	return list.ownerId === viewerId && !list.subjectDependentId
}

export function shouldDeliverListEvent(event: ListEvent, decision: ListAudienceDecision): boolean {
	if (!decision.canSubscribe) return false
	if (decision.isRecipient && RECIPIENT_HIDDEN_KINDS.has(event.kind)) return false
	return true
}

export async function resolveListAudience(
	viewerId: string,
	list: ListForAudience,
	dbx: SchemaDatabase = defaultDb
): Promise<ListAudienceDecision> {
	const isRecipient = isListRecipient(viewerId, list)
	if ((await canViewListAsAnyone(viewerId, list, dbx)).ok) return { canSubscribe: true, isRecipient }
	const edit = await canEditList(viewerId, list, dbx)
	return { canSubscribe: edit.ok, isRecipient }
}

const DEFAULT_TTL_MS = 30_000
const PRUNE_THRESHOLD = 2_000

/**
 * Per-event audience checks for the any-list channel, with a short cache.
 *
 * A cached decision can lag a permission change by up to `ttlMs`. That is
 * acceptable here: the event is an invalidation hint and the refetch it
 * triggers runs the real read-path checks. A list that no longer exists
 * (hard-deleted before the event fired) resolves to "deliver to nobody".
 */
export function createListAudienceResolver(opts: { dbx?: SchemaDatabase; ttlMs?: number; now?: () => number } = {}) {
	const dbx = opts.dbx ?? defaultDb
	const ttlMs = opts.ttlMs ?? DEFAULT_TTL_MS
	const now = opts.now ?? Date.now
	const decisions = new Map<string, { decision: ListAudienceDecision; expiresAt: number }>()

	function prune(at: number) {
		if (decisions.size <= PRUNE_THRESHOLD) return
		for (const [key, entry] of decisions) {
			if (entry.expiresAt <= at) decisions.delete(key)
		}
		if (decisions.size > PRUNE_THRESHOLD) decisions.clear()
	}

	async function resolveMany(viewerIds: Iterable<string>, listId: number): Promise<Map<string, ListAudienceDecision>> {
		const at = now()
		prune(at)
		const out = new Map<string, ListAudienceDecision>()
		const misses: Array<string> = []
		for (const viewerId of new Set(viewerIds)) {
			const cached = decisions.get(`${viewerId}:${listId}`)
			if (cached && cached.expiresAt > at) out.set(viewerId, cached.decision)
			else misses.push(viewerId)
		}
		if (misses.length === 0) return out

		const list = await dbx.query.lists.findFirst({
			where: eq(lists.id, listId),
			columns: { id: true, ownerId: true, subjectDependentId: true, isPrivate: true, isActive: true },
		})
		for (const viewerId of misses) {
			const decision: ListAudienceDecision = list
				? await resolveListAudience(viewerId, list, dbx)
				: { canSubscribe: false, isRecipient: false }
			decisions.set(`${viewerId}:${listId}`, { decision, expiresAt: at + ttlMs })
			out.set(viewerId, decision)
		}
		return out
	}

	return { resolveMany, clear: () => decisions.clear() }
}
