// Compact text rendering for tool results. The model reads these; keep
// them short, stable, and free of anything the recipient must not see
// (claims never reach owner-view formatters by construction).

import { type BirthMonth, birthMonthEnumValues } from '@/db/schema'

export function formatPrice(price: string | null, currency: string | null): string | null {
	if (!price) return null
	const n = Number(price)
	if (!Number.isFinite(n)) return price
	const cur = currency ?? 'USD'
	try {
		return new Intl.NumberFormat('en-US', { style: 'currency', currency: cur }).format(n)
	} catch {
		return `${n} ${cur}`
	}
}

export function birthdayString(month: BirthMonth | null, day: number | null, year: number | null): string | null {
	if (!month || !day) return null
	const idx = birthMonthEnumValues.indexOf(month)
	if (idx < 0) return null
	const mm = String(idx + 1).padStart(2, '0')
	const dd = String(day).padStart(2, '0')
	return year ? `${year}-${mm}-${dd}` : `--${mm}-${dd}`
}

/** Days from `today` (UTC calendar date) until the next occurrence of a month/day. */
export function daysUntilBirthday(month: BirthMonth | null, day: number | null, today: Date): number | null {
	if (!month || !day) return null
	const idx = birthMonthEnumValues.indexOf(month)
	if (idx < 0) return null
	const start = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
	let next = Date.UTC(today.getUTCFullYear(), idx, day)
	if (next < start) next = Date.UTC(today.getUTCFullYear() + 1, idx, day)
	return Math.round((next - start) / (24 * 60 * 60 * 1000))
}

export function lines(items: Array<string>): string {
	return items.join('\n')
}

export function plural(n: number, singular: string, pluralWord = `${singular}s`): string {
	return `${n} ${n === 1 ? singular : pluralWord}`
}
