// Server-only impls for the holiday-catalog admin surface.
//
// Two audiences:
// - Any signed-in user calls `getHolidaySnapshotImpl` to populate the
//   country + holiday pickers in the create-list dialog and the list-
//   settings form. Returns enabled entries with computed (start, end)
//   dates for the current year.
// - Admin calls the CRUD impls (`listCatalogEntries`, `addCatalogEntry`,
//   `updateCatalogEntry`, `deleteCatalogEntry`, `listLibraryCandidates`)
//   to manage the per-deploy whitelist.
//
// Disabled vs deleted: see `src/db/schema/holiday-catalog.ts`. Disable
// is the normal admin operation. Delete is rejected when any list
// references the row.

import Holidays from 'date-holidays'
import { and, count, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import type { SchemaDatabase } from '@/db'
import { db } from '@/db'
import { seedHolidayCatalogIfEmpty } from '@/db/holiday-catalog-seed'
import { holidayCatalog, lists } from '@/db/schema'
import {
	getHolidaySnapshot,
	type HolidaySnapshot,
	isCountryCode,
	nextOccurrenceForRule,
	resolveOccurrenceForRule,
	SUPPORTED_COUNTRIES,
} from '@/lib/holidays'

// =====================================================================
// Snapshot for the new-list pickers (any signed-in user)
// =====================================================================

export async function getHolidaySnapshotImpl(args: { now?: Date; dbx?: SchemaDatabase }): Promise<HolidaySnapshot> {
	const dbx = args.dbx ?? db
	return getHolidaySnapshot(args.now, dbx)
}

// =====================================================================
// Admin: list catalog entries (with referencing-list usage counts)
// =====================================================================

export type AdminCatalogEntry = {
	id: string
	country: string
	slug: string
	name: string
	rule: string
	isEnabled: boolean
	usageCount: number
	nextOccurrence: string | null
}

export const ListCatalogEntriesInputSchema = z.object({
	country: z.string().min(2).max(2).optional(),
})

export async function listCatalogEntriesImpl(args: {
	input: z.infer<typeof ListCatalogEntriesInputSchema>
	dbx?: SchemaDatabase
}): Promise<Array<AdminCatalogEntry>> {
	const dbx = args.dbx ?? db
	await seedHolidayCatalogIfEmpty(dbx)

	const rows = await dbx
		.select({
			id: holidayCatalog.id,
			country: holidayCatalog.country,
			slug: holidayCatalog.slug,
			name: holidayCatalog.name,
			rule: holidayCatalog.rule,
			isEnabled: holidayCatalog.isEnabled,
		})
		.from(holidayCatalog)
		.where(args.input.country ? eq(holidayCatalog.country, args.input.country) : undefined)
		.orderBy(holidayCatalog.country, holidayCatalog.slug)

	if (rows.length === 0) return []

	// Usage counts per (country, slug) - lists referencing the entry.
	// Single grouped query keeps this O(catalog size) regardless of
	// list table size.
	const usageRows = await dbx
		.select({
			country: lists.holidayCountry,
			slug: lists.holidayKey,
			count: count(lists.id).as('count'),
		})
		.from(lists)
		.where(eq(lists.type, 'holiday'))
		.groupBy(lists.holidayCountry, lists.holidayKey)

	const usageMap = new Map<string, number>()
	for (const u of usageRows) {
		if (!u.country || !u.slug) continue
		usageMap.set(`${u.country}:${u.slug}`, u.count)
	}

	const now = new Date()
	return rows.map(r => {
		const occ = nextOccurrenceForRule(r.country, r.rule, now)
		return {
			id: r.id,
			country: r.country,
			slug: r.slug,
			name: r.name,
			rule: r.rule,
			isEnabled: r.isEnabled,
			usageCount: usageMap.get(`${r.country}:${r.slug}`) ?? 0,
			nextOccurrence: occ ? occ.toISOString() : null,
		}
	})
}

// =====================================================================
// Admin: list candidate holidays from the date-holidays library that
// are not yet in the catalog for a country
// =====================================================================

export type LibraryCandidate = {
	rule: string
	name: string
	type: 'public' | 'observance'
	nextDate: string | null
}

export const ListLibraryCandidatesInputSchema = z.object({
	country: z.string().min(2).max(2),
})

export async function listLibraryCandidatesImpl(args: {
	input: z.infer<typeof ListLibraryCandidatesInputSchema>
	dbx?: SchemaDatabase
}): Promise<Array<LibraryCandidate>> {
	const dbx = args.dbx ?? db
	const { country } = args.input

	if (!isCountryCode(country)) return []

	const existing = await dbx.select({ rule: holidayCatalog.rule }).from(holidayCatalog).where(eq(holidayCatalog.country, country))
	const existingRules = new Set(existing.map(e => e.rule))

	const inst = new Holidays(country, { types: ['public', 'observance'] })
	const now = new Date()
	const year = now.getFullYear()
	const libRows = inst.getHolidays(year)

	const out: Array<LibraryCandidate> = []
	const seenRules = new Set<string>()
	for (const h of libRows) {
		if (h.substitute) continue
		if (h.type !== 'public' && h.type !== 'observance') continue
		if (existingRules.has(h.rule)) continue
		if (seenRules.has(h.rule)) continue
		seenRules.add(h.rule)
		out.push({
			rule: h.rule,
			name: h.name,
			type: h.type,
			nextDate: new Date(h.start).toISOString(),
		})
	}
	out.sort((a, b) => a.name.localeCompare(b.name))
	return out
}

// =====================================================================
// Admin: list supported countries (with friendly names)
// =====================================================================

export function listAdminSupportedCountries(): ReadonlyArray<{ code: string; name: string }> {
	return SUPPORTED_COUNTRIES
}

// =====================================================================
// Admin: add a catalog entry
// =====================================================================

export type AddCatalogEntryResult =
	| { kind: 'ok'; id: string; slug: string }
	| { kind: 'error'; reason: 'invalid-country' | 'invalid-rule' | 'duplicate-slug' | 'invalid-name' }

export const AddCatalogEntryInputSchema = z.object({
	country: z.string().min(2).max(2),
	rule: z.string().min(1),
	// Display name. If omitted, the library's name for the rule is used.
	name: z.string().min(1).max(120).optional(),
	// Optional explicit slug. If omitted, derived from `name` (or library
	// name) via kebab-case.
	slug: z
		.string()
		.min(1)
		.max(80)
		.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'slug must be kebab-case')
		.optional(),
})

function slugify(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '')
		.slice(0, 80)
}

export async function addCatalogEntryImpl(args: {
	input: z.infer<typeof AddCatalogEntryInputSchema>
	dbx?: SchemaDatabase
}): Promise<AddCatalogEntryResult> {
	const dbx = args.dbx ?? db
	const { country, rule } = args.input

	if (!isCountryCode(country)) return { kind: 'error', reason: 'invalid-country' }

	// Validate the rule resolves in the library for the current year.
	const occ = resolveOccurrenceForRule(country, rule, new Date().getFullYear())
	let resolvedName: string | null = null
	if (!occ) {
		// Some rules are valid but produce nothing in the current year
		// (e.g. religious feasts on a year that excludes them, or
		// `since 2099`). Try a wider window.
		for (let dy = 1; dy <= 4; dy++) {
			const o = resolveOccurrenceForRule(country, rule, new Date().getFullYear() + dy)
			if (o) {
				resolvedName = libraryNameFor(country, rule, new Date().getFullYear() + dy)
				break
			}
		}
		if (!resolvedName) return { kind: 'error', reason: 'invalid-rule' }
	} else {
		resolvedName = libraryNameFor(country, rule, new Date().getFullYear())
	}

	const name = (args.input.name ?? resolvedName)?.trim()
	if (!name) return { kind: 'error', reason: 'invalid-name' }

	const slug = args.input.slug ?? slugify(name)
	if (!slug) return { kind: 'error', reason: 'invalid-name' }

	const existing = await dbx.query.holidayCatalog.findFirst({
		where: and(eq(holidayCatalog.country, country), eq(holidayCatalog.slug, slug)),
		columns: { id: true },
	})
	if (existing) return { kind: 'error', reason: 'duplicate-slug' }

	// New rows land disabled (opt-in policy - see the holiday-catalog
	// schema header). The admin enables them from the same row in the
	// catalog UI once they've confirmed the rule and rendered name.
	const [row] = await dbx
		.insert(holidayCatalog)
		.values({ country, slug, name, rule, isEnabled: false })
		.returning({ id: holidayCatalog.id, slug: holidayCatalog.slug })

	return { kind: 'ok', id: row.id, slug: row.slug }
}

function libraryNameFor(country: string, rule: string, year: number): string | null {
	const inst = new Holidays(country, { types: ['public', 'observance'] })
	const rows = inst.getHolidays(year)
	const match = rows.find(h => h.rule === rule && !h.substitute)
	return match?.name ?? null
}

// =====================================================================
// Admin: update (rename + toggle enabled)
// =====================================================================

export type UpdateCatalogEntryResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'invalid-name' }

export const UpdateCatalogEntryInputSchema = z.object({
	id: z.string().uuid(),
	name: z.string().min(1).max(120).optional(),
	isEnabled: z.boolean().optional(),
})

export async function updateCatalogEntryImpl(args: {
	input: z.infer<typeof UpdateCatalogEntryInputSchema>
	dbx?: SchemaDatabase
}): Promise<UpdateCatalogEntryResult> {
	const dbx = args.dbx ?? db
	const updates: Record<string, unknown> = {}
	if (args.input.name !== undefined) {
		const trimmed = args.input.name.trim()
		if (!trimmed) return { kind: 'error', reason: 'invalid-name' }
		updates.name = trimmed
	}
	if (args.input.isEnabled !== undefined) updates.isEnabled = args.input.isEnabled
	if (Object.keys(updates).length === 0) return { kind: 'ok' }

	const result = await dbx
		.update(holidayCatalog)
		.set(updates)
		.where(eq(holidayCatalog.id, args.input.id))
		.returning({ id: holidayCatalog.id })
	if (result.length === 0) return { kind: 'error', reason: 'not-found' }
	return { kind: 'ok' }
}

// =====================================================================
// Admin: delete (only when zero referencing lists)
// =====================================================================

export type DeleteCatalogEntryResult = { kind: 'ok' } | { kind: 'error'; reason: 'not-found' | 'in-use'; usageCount?: number }

export const DeleteCatalogEntryInputSchema = z.object({
	id: z.string().uuid(),
})

export async function deleteCatalogEntryImpl(args: {
	input: z.infer<typeof DeleteCatalogEntryInputSchema>
	dbx?: SchemaDatabase
}): Promise<DeleteCatalogEntryResult> {
	const dbx = args.dbx ?? db
	const entry = await dbx.query.holidayCatalog.findFirst({
		where: eq(holidayCatalog.id, args.input.id),
		columns: { country: true, slug: true },
	})
	if (!entry) return { kind: 'error', reason: 'not-found' }

	const [{ count: usageCount }] = await dbx
		.select({ count: sql<number>`COUNT(*)::int` })
		.from(lists)
		.where(and(eq(lists.holidayCountry, entry.country), eq(lists.holidayKey, entry.slug)))

	if (usageCount > 0) {
		return { kind: 'error', reason: 'in-use', usageCount }
	}

	await dbx.delete(holidayCatalog).where(eq(holidayCatalog.id, args.input.id))
	return { kind: 'ok' }
}
