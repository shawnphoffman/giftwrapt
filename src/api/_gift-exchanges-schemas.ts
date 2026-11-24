// Input schemas for the admin gift exchange server functions (plan 39).
// Client-safe: no database or server-only imports, because the server
// functions' input validators run in the browser bundle too. The impls live
// in `_gift-exchanges-impl.ts`.

import { z } from 'zod'

const exchangeName = z.string().trim().min(1).max(120)
// An amount in the deployment's default currency. Null means no budget.
const exchangeBudget = z.number().nonnegative().max(99_999_999.99).nullable()
const exchangeGiftDate = z.iso.date()
const memberPair = z.object({ giverMemberId: z.uuid(), recipientMemberId: z.uuid() })

export const CreateExchangeInputSchema = z.object({
	name: exchangeName,
	budget: exchangeBudget,
	giftDate: exchangeGiftDate,
	memberUserIds: z.array(z.string().min(1)).max(500).default([]),
})
export const UpdateExchangeInputSchema = z.object({
	exchangeId: z.uuid(),
	name: exchangeName,
	budget: exchangeBudget,
	giftDate: exchangeGiftDate,
})
export const ExchangeIdInputSchema = z.object({ exchangeId: z.uuid() })
export const AddMembersInputSchema = z.object({
	exchangeId: z.uuid(),
	userIds: z.array(z.string().min(1)).min(1).max(500),
})
export const RemoveMemberInputSchema = z.object({
	exchangeId: z.uuid(),
	memberId: z.uuid(),
	confirmRedraw: z.boolean().optional(),
})
export const SaveMemberRulesInputSchema = z.object({
	exchangeId: z.uuid(),
	memberId: z.uuid(),
	/** Every direction involving `memberId` that should be No. Replaces what was stored. */
	blocks: z.array(memberPair).max(2000),
	confirmRedraw: z.boolean().optional(),
})

export type CreateExchangeInput = z.output<typeof CreateExchangeInputSchema>
export type UpdateExchangeInput = z.output<typeof UpdateExchangeInputSchema>
export type AddMembersInput = z.output<typeof AddMembersInputSchema>
export type RemoveMemberInput = z.output<typeof RemoveMemberInputSchema>
export type SaveMemberRulesInput = z.output<typeof SaveMemberRulesInputSchema>
