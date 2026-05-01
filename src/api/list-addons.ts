// Server-fn surface for list addons. All implementations live in
// `_list-addons-impl.ts`. References to those impls only happen
// inside `.handler()` and `.inputValidator()` callbacks, which
// TanStack Start strips on the client.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { authMiddleware } from '@/middleware/auth'

import {
	ArchiveAddonInputSchema,
	type ArchiveAddonResult,
	archiveListAddonImpl,
	CreateAddonInputSchema,
	type CreateAddonResult,
	createListAddonImpl,
	DeleteAddonInputSchema,
	type DeleteAddonResult,
	deleteListAddonImpl,
	UpdateAddonInputSchema,
	type UpdateAddonResult,
	updateListAddonImpl,
} from './_list-addons-impl'

export type { ArchiveAddonResult, CreateAddonResult, DeleteAddonResult, UpdateAddonResult } from './_list-addons-impl'

export const createListAddon = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof CreateAddonInputSchema>) => CreateAddonInputSchema.parse(data))
	.handler(({ context, data }): Promise<CreateAddonResult> => createListAddonImpl({ userId: context.session.user.id, input: data }))

export const updateListAddon = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateAddonInputSchema>) => UpdateAddonInputSchema.parse(data))
	.handler(({ context, data }): Promise<UpdateAddonResult> => updateListAddonImpl({ userId: context.session.user.id, input: data }))

export const archiveListAddon = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ArchiveAddonInputSchema>) => ArchiveAddonInputSchema.parse(data))
	.handler(({ context, data }): Promise<ArchiveAddonResult> => archiveListAddonImpl({ userId: context.session.user.id, input: data }))

export const deleteListAddon = createServerFn({ method: 'POST' })
	.middleware([authMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteAddonInputSchema>) => DeleteAddonInputSchema.parse(data))
	.handler(({ context, data }): Promise<DeleteAddonResult> => deleteListAddonImpl({ userId: context.session.user.id, input: data }))
