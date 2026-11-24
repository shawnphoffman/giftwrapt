// Client-side reading of the admin exchange read: who can gift to whom under
// the stored rules, or under an unsaved change. Uses the same pure draw
// functions the server draws with, so the dialog can refuse a change that
// would make the draw impossible before it is saved.

import type { AdminExchangeDetail } from '@/api/_gift-exchanges-impl'
import { buildAllowedRelation, checkDraw, type DrawCheck, type MemberPair } from '@/lib/gift-exchange/draw'
import type { LockedReason } from '@/lib/gift-exchange/rules'

export const pairKey = (giver: string, recipient: string) => `${giver}:${recipient}`

export type ExchangeModel = {
	memberIds: Array<string>
	lockedReason: Map<string, LockedReason>
	blocked: Set<string>
	allowed: ReadonlyMap<string, ReadonlySet<string>>
	check: DrawCheck
}

/**
 * Builds the relation. With `draft`, the blocks involving `draft.memberId`
 * are replaced by `draft.blocks` (keys from `pairKey`).
 */
export function buildExchangeModel(
	exchange: Pick<AdminExchangeDetail, 'members' | 'locked' | 'blocked'>,
	draft?: { memberId: string; blocks: ReadonlySet<string> }
): ExchangeModel {
	const memberIds = exchange.members.map(m => m.id)
	const lockedReason = new Map(exchange.locked.map(p => [pairKey(p.giverMemberId, p.recipientMemberId), p.reason]))
	const blocked = new Set<string>()
	for (const p of exchange.blocked) {
		if (draft && (p.giverMemberId === draft.memberId || p.recipientMemberId === draft.memberId)) continue
		blocked.add(pairKey(p.giverMemberId, p.recipientMemberId))
	}
	if (draft) for (const k of draft.blocks) blocked.add(k)
	const disallowed: Array<MemberPair> = [...exchange.locked]
	for (const k of blocked) {
		const [giverMemberId, recipientMemberId] = k.split(':')
		disallowed.push({ giverMemberId, recipientMemberId })
	}
	const allowed = buildAllowedRelation(memberIds, disallowed)
	return { memberIds, lockedReason, blocked, allowed, check: checkDraw(memberIds, allowed) }
}

/** How many people a member can gift to, and how many can gift to them. */
export function optionCounts(model: ExchangeModel, memberId: string): { gives: number; receives: number } {
	const gives = model.allowed.get(memberId)?.size ?? 0
	let receives = 0
	for (const [giver, set] of model.allowed) if (giver !== memberId && set.has(memberId)) receives++
	return { gives, receives }
}
