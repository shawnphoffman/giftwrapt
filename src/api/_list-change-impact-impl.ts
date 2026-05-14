// Server-only impl for the list-change-impact server fn. Lives outside
// `list-change-impact.ts` so the static import chain (db, intelligence
// helpers, settings) only loads on the server — `list-change-impact.ts`
// only imports this from inside its `.handler()` callback, which
// TanStack Start strips on the client.
//
// Spoiler-safe: never reads claim data; only list metadata and event
// dates. Mirrors the existing api/lists.ts <-> _lists-impl.ts split.

import { and, eq, isNull, ne } from 'drizzle-orm'

import { db } from '@/db'
import { lists } from '@/db/schema'
import { getInWindowEventsForSubject } from '@/lib/intelligence/upcoming-events'
import { getAppSettings } from '@/lib/settings-loader'

import type { GetListChangeImpactInputsResult } from './list-change-impact'

export async function getListChangeImpactInputsImpl(args: { userId: string; listId: number }): Promise<GetListChangeImpactInputsResult> {
	const { userId, listId } = args

	const list = await db.query.lists.findFirst({
		where: eq(lists.id, listId),
		columns: { id: true, ownerId: true, subjectDependentId: true },
	})
	if (!list) return { inWindowEvents: [], otherSubjectLists: [] }
	// Spoiler-safety + ergonomic-fit: only the owner sees these warnings.
	// Editors changing the list type would benefit too, but in practice
	// type changes are owner-only in the dialog UI.
	if (list.ownerId !== userId) return { inWindowEvents: [], otherSubjectLists: [] }

	const settings = await getAppSettings(db)
	const dependentId = list.subjectDependentId ?? null

	const [events, sibling] = await Promise.all([
		getInWindowEventsForSubject({ userId, dependentId, settings, dbx: db }),
		db
			.select({ id: lists.id, type: lists.type, customHolidayId: lists.customHolidayId, isActive: lists.isActive })
			.from(lists)
			.where(
				and(
					eq(lists.ownerId, userId),
					dependentId === null ? isNull(lists.subjectDependentId) : eq(lists.subjectDependentId, dependentId),
					ne(lists.id, list.id),
					// Exclude giftideas/todos from "coverage" math; they
					// never cover an auto-archive event.
					ne(lists.type, 'giftideas'),
					ne(lists.type, 'todos')
				)
			),
	])

	return {
		inWindowEvents: events,
		otherSubjectLists: sibling,
	}
}
