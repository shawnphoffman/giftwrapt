// Pure types + helpers for the upcoming-event helper, split out from
// `upcoming-events.ts` so client-side callers (the list-edit dialog's
// list-change-impact helper) can import them without dragging the
// server-only `customHolidayNextOccurrence` + `db` chain into the
// browser bundle.

import type { ListType } from '@/db/schema/enums'

export type InWindowEvent =
	| {
			kind: 'birthday'
			matchTypes: ReadonlyArray<ListType>
			occurrence: Date
			occurrenceISO: string
			daysUntil: number
			eventTitle: 'Birthday'
	  }
	| {
			kind: 'christmas'
			matchTypes: ReadonlyArray<ListType>
			occurrence: Date
			occurrenceISO: string
			daysUntil: number
			eventTitle: 'Christmas'
	  }
	| {
			kind: 'custom-holiday'
			matchTypes: ReadonlyArray<ListType>
			customHolidayId: string
			occurrence: Date
			occurrenceISO: string
			daysUntil: number
			eventTitle: string
	  }

// True when at least one of the subject's lists covers the event under
// auto-archive's predicates: list type is in `event.matchTypes`, and for
// custom-holiday events the list's `customHolidayId` matches. Pure;
// safe for browser bundles.
export function eventIsCovered(
	event: InWindowEvent,
	subjectLists: ReadonlyArray<{ type: ListType; customHolidayId: string | null; isActive: boolean }>
): boolean {
	for (const list of subjectLists) {
		if (!list.isActive) continue
		if (!event.matchTypes.includes(list.type)) continue
		if (event.kind === 'custom-holiday' && list.customHolidayId !== event.customHolidayId) continue
		return true
	}
	return false
}
