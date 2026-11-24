// Server-fn surface for the admin gift exchange screens (plan 39). Every
// function is admin-only. Implementations live in `_gift-exchanges-impl.ts`.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { adminAuthMiddleware } from '@/middleware/auth'

import {
	addMembersImpl,
	type AddMembersResult,
	type AdminExchangeDetail,
	type AdminExchangeMember,
	type AdminExchangeSummary,
	archiveExchangeImpl,
	type ArchiveExchangeResult,
	createExchangeImpl,
	type CreateExchangeResult,
	deleteExchangeImpl,
	type DeleteExchangeResult,
	drawExchangeImpl,
	type DrawExchangeResult,
	type ExchangeState,
	getExchangeForAdminImpl,
	type GetExchangeResult,
	listExchangesImpl,
	redrawExchangeImpl,
	type RedrawExchangeResult,
	removeMemberImpl,
	type RemoveMemberResult,
	saveMemberRulesImpl,
	type SaveMemberRulesResult,
	updateExchangeImpl,
	type UpdateExchangeResult,
} from './_gift-exchanges-impl'
import {
	AddMembersInputSchema,
	CreateExchangeInputSchema,
	ExchangeIdInputSchema,
	RemoveMemberInputSchema,
	SaveMemberRulesInputSchema,
	UpdateExchangeInputSchema,
} from './_gift-exchanges-schemas'

export type {
	AddMembersResult,
	AdminExchangeDetail,
	AdminExchangeMember,
	AdminExchangeSummary,
	ArchiveExchangeResult,
	CreateExchangeResult,
	DeleteExchangeResult,
	DrawExchangeResult,
	ExchangeState,
	GetExchangeResult,
	RedrawExchangeResult,
	RemoveMemberResult,
	SaveMemberRulesResult,
	UpdateExchangeResult,
}

export const listGiftExchangesAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler((): Promise<Array<AdminExchangeSummary>> => listExchangesImpl())

export const getGiftExchangeAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ExchangeIdInputSchema>) => ExchangeIdInputSchema.parse(data))
	.handler(({ data }): Promise<GetExchangeResult> => getExchangeForAdminImpl({ exchangeId: data.exchangeId }))

export const createGiftExchangeAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateExchangeInputSchema>) => CreateExchangeInputSchema.parse(data))
	.handler(({ context, data }): Promise<CreateExchangeResult> => createExchangeImpl({ actorId: context.session.user.id, input: data }))

export const updateGiftExchangeAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateExchangeInputSchema>) => UpdateExchangeInputSchema.parse(data))
	.handler(({ data }): Promise<UpdateExchangeResult> => updateExchangeImpl({ input: data }))

export const deleteGiftExchangeAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ExchangeIdInputSchema>) => ExchangeIdInputSchema.parse(data))
	.handler(({ data }): Promise<DeleteExchangeResult> => deleteExchangeImpl({ exchangeId: data.exchangeId }))

export const addGiftExchangeMembersAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AddMembersInputSchema>) => AddMembersInputSchema.parse(data))
	.handler(({ data }): Promise<AddMembersResult> => addMembersImpl({ input: data }))

export const removeGiftExchangeMemberAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof RemoveMemberInputSchema>) => RemoveMemberInputSchema.parse(data))
	.handler(({ data }): Promise<RemoveMemberResult> => removeMemberImpl({ input: data }))

export const saveGiftExchangeMemberRulesAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof SaveMemberRulesInputSchema>) => SaveMemberRulesInputSchema.parse(data))
	.handler(({ data }): Promise<SaveMemberRulesResult> => saveMemberRulesImpl({ input: data }))

export const drawGiftExchangeAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ExchangeIdInputSchema>) => ExchangeIdInputSchema.parse(data))
	.handler(({ data }): Promise<DrawExchangeResult> => drawExchangeImpl({ exchangeId: data.exchangeId }))

export const redrawGiftExchangeAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ExchangeIdInputSchema>) => ExchangeIdInputSchema.parse(data))
	.handler(({ data }): Promise<RedrawExchangeResult> => redrawExchangeImpl({ exchangeId: data.exchangeId }))

export const archiveGiftExchangeAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ExchangeIdInputSchema>) => ExchangeIdInputSchema.parse(data))
	.handler(({ data }): Promise<ArchiveExchangeResult> => archiveExchangeImpl({ exchangeId: data.exchangeId }))
