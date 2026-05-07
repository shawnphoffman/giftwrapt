// Server-fn surface for the holiday-catalog admin UI and the new-list
// pickers. Implementations live in `_holiday-catalog-impl.ts`.

import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'

import { loggingMiddleware } from '@/lib/logger'
import { adminAuthMiddleware, authMiddleware } from '@/middleware/auth'

import {
	addCatalogEntryImpl,
	AddCatalogEntryInputSchema,
	type AddCatalogEntryResult,
	type AdminCatalogEntry,
	deleteCatalogEntryImpl,
	DeleteCatalogEntryInputSchema,
	type DeleteCatalogEntryResult,
	getHolidaySnapshotImpl,
	type LibraryCandidate,
	listAdminSupportedCountries,
	listCatalogEntriesImpl,
	ListCatalogEntriesInputSchema,
	listLibraryCandidatesImpl,
	ListLibraryCandidatesInputSchema,
	updateCatalogEntryImpl,
	UpdateCatalogEntryInputSchema,
	type UpdateCatalogEntryResult,
} from './_holiday-catalog-impl'

export type { AddCatalogEntryResult, AdminCatalogEntry, DeleteCatalogEntryResult, LibraryCandidate, UpdateCatalogEntryResult }

// Authenticated read for the new-list pickers. Any signed-in user.
export const getHolidaySnapshot = createServerFn({ method: 'GET' })
	.middleware([authMiddleware, loggingMiddleware])
	.handler(() => getHolidaySnapshotImpl({}))

// Admin: list catalog rows with usage counts, optionally filtered by country.
export const listCatalogEntriesAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ListCatalogEntriesInputSchema>) => ListCatalogEntriesInputSchema.parse(data))
	.handler(({ data }): Promise<Array<AdminCatalogEntry>> => listCatalogEntriesImpl({ input: data }))

// Admin: list candidate library holidays for a country (entries not yet
// in the catalog). Used by the "Add holiday" picker.
export const listLibraryCandidatesAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof ListLibraryCandidatesInputSchema>) => ListLibraryCandidatesInputSchema.parse(data))
	.handler(({ data }): Promise<Array<LibraryCandidate>> => listLibraryCandidatesImpl({ input: data }))

// Admin: list supported countries (friendly names + codes).
export const getAdminSupportedCountries = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.handler(() => Promise.resolve(listAdminSupportedCountries()))

// Admin: add a catalog entry.
export const addCatalogEntryAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof AddCatalogEntryInputSchema>) => AddCatalogEntryInputSchema.parse(data))
	.handler(({ data }): Promise<AddCatalogEntryResult> => addCatalogEntryImpl({ input: data }))

// Admin: rename or toggle enabled.
export const updateCatalogEntryAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof UpdateCatalogEntryInputSchema>) => UpdateCatalogEntryInputSchema.parse(data))
	.handler(({ data }): Promise<UpdateCatalogEntryResult> => updateCatalogEntryImpl({ input: data }))

// Admin: delete (rejects when usage > 0).
export const deleteCatalogEntryAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware, loggingMiddleware])
	.inputValidator((data: z.input<typeof DeleteCatalogEntryInputSchema>) => DeleteCatalogEntryInputSchema.parse(data))
	.handler(({ data }): Promise<DeleteCatalogEntryResult> => deleteCatalogEntryImpl({ input: data }))
