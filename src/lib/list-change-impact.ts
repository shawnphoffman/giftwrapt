// Pure helper that turns a list-change preview into user-facing
// warnings about auto-archive coverage. No DB access; caller passes
// pre-fetched `inWindowEvents` and `otherSubjectLists`.
//
// Warnings are calendar-only and never reference claim state — surfacing
// "you have N claims" to the recipient would break the spoiler-protection
// invariant. The owner agrees by clicking Save; warnings are non-blocking.
//
// Four conditions:
//   1. Type changes AWAY from a type that currently covers an in-window
//      event. No other subject list covers it after the change.
//   2. customHolidayId changes away from an in-window custom holiday.
//      No other holiday-typed subject list covers the same holiday.
//   3. List archives (isActive=true -> false) and currently covers an
//      in-window event with no other subject list covering it.
//   4. List deletes and currently covers an in-window event with no
//      other subject list covering it (slightly more final phrasing).
//
// "Other subject list" excludes the list being edited itself.

import type { ListType } from '@/db/schema/enums'
import { m } from '@/paraglide/messages.js'

// Import from the pure types file (NOT `./intelligence/upcoming-events`)
// so this module stays client-safe — pulling from the server-only file
// would drag `db`/`pg` into the browser bundle when the edit-list dialog
// imports `evaluateListChangeImpact`.
import type { InWindowEvent } from './intelligence/upcoming-events-types'
import { eventIsCovered } from './intelligence/upcoming-events-types'

export type ListChangeImpactList = {
	id: number
	type: ListType
	customHolidayId: string | null
	isActive: boolean
}

export type ListChangeImpactProposed = {
	type?: ListType
	customHolidayId?: string | null
	isActive?: boolean
	delete?: boolean
}

export type ListChangeImpactInput = {
	list: ListChangeImpactList
	proposed: ListChangeImpactProposed
	inWindowEvents: ReadonlyArray<InWindowEvent>
	otherSubjectLists: ReadonlyArray<ListChangeImpactList>
}

export type ListChangeImpactWarning = {
	// Discriminator so the UI can vary tone if it wants to. v1 renders
	// the same `text` for all kinds with a single Alert variant.
	kind: 'type-away' | 'customHolidayId-away' | 'archive' | 'delete'
	text: string
}

export type ListChangeImpactOutput = {
	warnings: Array<ListChangeImpactWarning>
}

// The warning sentences, worded on each call in the language of whoever is
// asking. One whole message per kind and per "today / tomorrow / in N days",
// so a translation never has to fit a fragment into an English sentence.
// Deleting and archiving differ only in the last sentence; a type change and
// a holiday change read the same.
type WarningWording = 'delete' | 'archive' | 'change'

function warningText(wording: WarningWording, event: InWindowEvent): string {
	const eventTitle = event.eventTitle
	const count = event.daysUntil
	switch (wording) {
		case 'delete':
			if (count <= 0) return m.list_impact_delete_today({ eventTitle })
			if (count === 1) return m.list_impact_delete_tomorrow({ eventTitle })
			return m.list_impact_delete_in_days({ eventTitle, count })
		case 'archive':
			if (count <= 0) return m.list_impact_archive_today({ eventTitle })
			if (count === 1) return m.list_impact_archive_tomorrow({ eventTitle })
			return m.list_impact_archive_in_days({ eventTitle, count })
		case 'change':
			if (count <= 0) return m.list_impact_change_today({ eventTitle })
			if (count === 1) return m.list_impact_change_tomorrow({ eventTitle })
			return m.list_impact_change_in_days({ eventTitle, count })
	}
}

// True when, after the proposed change is applied, the edited list
// still covers the event. Used to short-circuit warnings when the user
// is converting toward a matching type — that's the analyzer's whole
// point, no need to warn.
function listAfterChangeCovers(
	listAfter: { type: ListType; customHolidayId: string | null; isActive: boolean },
	event: InWindowEvent
): boolean {
	return eventIsCovered(event, [listAfter])
}

export function evaluateListChangeImpact(input: ListChangeImpactInput): ListChangeImpactOutput {
	const { list, proposed, inWindowEvents, otherSubjectLists } = input
	const warnings: Array<ListChangeImpactWarning> = []

	// Compute the post-change shape of the list. delete/archive both
	// kill coverage; type/customHolidayId substitute as provided.
	const isBeingDeleted = proposed.delete === true
	const isBeingArchived = proposed.isActive === false
	const afterIsActive = isBeingDeleted ? false : (proposed.isActive ?? list.isActive)
	const afterType = proposed.type ?? list.type
	const afterCustomHolidayId = proposed.customHolidayId !== undefined ? proposed.customHolidayId : list.customHolidayId

	const after = {
		type: afterType,
		customHolidayId: afterCustomHolidayId,
		isActive: afterIsActive,
	}

	for (const event of inWindowEvents) {
		// Did the list cover this event BEFORE the change?
		const coveredBefore = eventIsCovered(event, [list])
		if (!coveredBefore) continue

		// Will the list still cover it AFTER?
		const coveredAfter = listAfterChangeCovers(after, event)
		if (coveredAfter) continue

		// Does ANY other subject list cover it (no change needed for them)?
		const otherCovers = eventIsCovered(event, otherSubjectLists)
		if (otherCovers) continue

		// We're killing coverage. Pick a warning kind by the most-specific
		// proposed change. Order matters: delete > archive > customHolidayId > type.
		if (isBeingDeleted) {
			warnings.push({
				kind: 'delete',
				text: warningText('delete', event),
			})
		} else if (isBeingArchived) {
			warnings.push({
				kind: 'archive',
				text: warningText('archive', event),
			})
		} else if (
			event.kind === 'custom-holiday' &&
			proposed.customHolidayId !== undefined &&
			proposed.customHolidayId !== list.customHolidayId &&
			(proposed.type === undefined || proposed.type === list.type)
		) {
			warnings.push({
				kind: 'customHolidayId-away',
				text: warningText('change', event),
			})
		} else {
			warnings.push({
				kind: 'type-away',
				text: warningText('change', event),
			})
		}
	}

	return { warnings }
}
