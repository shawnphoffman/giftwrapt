import { and, eq, isNull, ne, sql } from 'drizzle-orm'

import { lists } from '@/db/schema'

import type { Analyzer } from '../analyzer'
import { combineHashes, sha256Hex } from '../hash'
import type { AnalyzerResult, ListRef } from '../types'

// Pure heuristic analyzer: does the user have any active list with
// `isPrimary = true`? If not, surface a list-picker rec. No AI calls.
//
// Eligible lists for the picker = the user's active, non-giftideas lists
// (giftideas are spoiler surfaces and can't be primary by definition).
//
// Dependent subjects are skipped: `lists.isPrimary` is per-owner, not
// per-(owner, dependent), and `setPrimaryListImpl` clears the previous
// primary for the entire owner. Surfacing a "pick a primary list for
// <dependent>" rec would silently overwrite the guardian's own primary
// list when applied. If we ever scope primary by dependent, drop this
// guard.
export const primaryListAnalyzer: Analyzer = {
	id: 'primary-list',
	label: 'Primary list',
	enabledByDefault: true,
	async run(ctx): Promise<AnalyzerResult> {
		const t0 = Date.now()
		if (ctx.subject.kind === 'dependent') {
			return {
				recs: [],
				steps: [{ name: 'load-lists', latencyMs: Date.now() - t0 }],
				inputHash: combineHashes([sha256Hex('primary-list|dependent-skip')]),
			}
		}
		const userLists = await ctx.db
			.select({
				id: lists.id,
				name: lists.name,
				type: lists.type,
				isPrivate: lists.isPrivate,
				isPrimary: lists.isPrimary,
				isActive: lists.isActive,
				ownerName: sql<string>`coalesce(u.name, '')`,
			})
			.from(lists)
			.leftJoin(sql`users u`, sql`u.id = ${lists.ownerId}`)
			.where(and(eq(lists.ownerId, ctx.userId), isNull(lists.subjectDependentId), eq(lists.isActive, true), ne(lists.type, 'giftideas')))

		const hasPrimary = userLists.some(l => l.isPrimary)
		const eligible = userLists.filter(l => !l.isPrimary)

		// Hash slice: does a primary exist + the set of eligible list ids.
		// Changes here invalidate this analyzer's cache without disturbing others.
		const inputHash = sha256Hex(
			`primary-list|${hasPrimary ? '1' : '0'}|${eligible
				.map(l => l.id)
				.sort()
				.join(',')}`
		)

		const steps = [{ name: 'load-lists', latencyMs: Date.now() - t0 }]

		if (hasPrimary || eligible.length === 0) {
			return { recs: [], steps, inputHash: combineHashes([inputHash]) }
		}

		const subjectName = userLists.find(l => l.ownerName)?.ownerName ?? 'You'
		const listSubject: ListRef['subject'] = { kind: 'user', name: subjectName, image: ctx.subject.image }
		const eligibleRefs: Array<ListRef> = eligible.map(l => ({
			id: String(l.id),
			name: l.name,
			type: l.type as ListRef['type'],
			isPrivate: l.isPrivate,
			subject: listSubject,
		}))

		return {
			recs: [
				{
					kind: 'no-primary',
					severity: 'important',
					title: 'Pick a primary list',
					body: `You have ${eligible.length} active list${eligible.length === 1 ? '' : 's'} but none are marked primary. Your primary list is the one shoppers see first - choosing one helps gifters know where to focus.`,
					interaction: {
						kind: 'list-picker',
						saveLabel: 'Save as primary',
						eligibleLists: eligibleRefs,
					},
					affected: undefined,
					relatedLists: eligibleRefs,
					// Single rec per user; the fingerprint is just the analyzer + kind.
					// We deliberately do NOT include the eligible list ids - if the user
					// dismisses this, we shouldn't re-prompt the moment they create a new list.
					fingerprintTargets: [],
				},
			],
			steps,
			inputHash: combineHashes([inputHash]),
		}
	},
}
