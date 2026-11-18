import { type BirthMonth, birthMonthEnumValues, type ListType, type Priority } from '@/db/schema/enums'
import { formatCalendarDate } from '@/lib/i18n/format'
import type { Locale } from '@/lib/i18n/locales'
import { m } from '@/paraglide/messages.js'

// Names for the app's fixed sets (priorities, list types, months), in the
// language the page renders in (plan 36c). These used to be copied into each
// component as a `Record<Value, string>`.
//
// They are functions, never module-level tables: a table is built once when
// the module loads, in whatever locale happened to be current then, and on
// the server one module serves every request.
//
// Passing no locale uses the current one; code with no request (emails, cron)
// passes the recipient's.

type MessageOptions = { locale?: Locale }

function options(locale?: Locale): MessageOptions {
	return locale ? { locale } : {}
}

export function priorityLabel(priority: Priority, locale?: Locale): string {
	switch (priority) {
		case 'very-high':
			return m.priority_very_high({}, options(locale))
		case 'high':
			return m.priority_high({}, options(locale))
		case 'normal':
			return m.priority_normal({}, options(locale))
		case 'low':
			return m.priority_low({}, options(locale))
	}
}

export function listTypeLabel(type: ListType, locale?: Locale): string {
	switch (type) {
		case 'wishlist':
			return m.list_type_wishlist({}, options(locale))
		case 'christmas':
			return m.list_type_christmas({}, options(locale))
		case 'birthday':
			return m.list_type_birthday({}, options(locale))
		case 'giftideas':
			return m.list_type_giftideas({}, options(locale))
		case 'holiday':
			return m.list_type_holiday({}, options(locale))
		case 'todos':
			return m.list_type_todos({}, options(locale))
		case 'test':
			return m.list_type_test({}, options(locale))
	}
}

// Month names come from the platform, not the catalog. A month is given as
// the stored enum value ('january') or its number (1 to 12).
function monthIndex(month: BirthMonth | number): number {
	return typeof month === 'number' ? month - 1 : birthMonthEnumValues.indexOf(month)
}

// 2000 is a leap year, so February 29 is a real date here.
function dateIn2000(month: BirthMonth | number, day = 1): number {
	return Date.UTC(2000, monthIndex(month), day)
}

// "January", "janvier".
export function monthName(month: BirthMonth | number, locale?: Locale): string {
	return formatCalendarDate(dateIn2000(month), { month: 'long' }, locale)
}

// A birthday or other yearly date, with as much as is known: "January",
// "January 9", "January 9, 1990" ("9 janvier 1990" in French).
export function formatMonthDay(month: BirthMonth | number, day?: number | null, year?: number | null, locale?: Locale): string {
	if (!day) return monthName(month, locale)
	if (!year) return formatCalendarDate(dateIn2000(month, day), { month: 'long', day: 'numeric' }, locale)
	return formatCalendarDate(Date.UTC(year, monthIndex(month), day), { month: 'long', day: 'numeric', year: 'numeric' }, locale)
}
