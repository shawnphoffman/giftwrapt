// "3 days ago" / "in 2 hours" formatting for timestamps in lists and
// tables. Client-safe (Intl only).

const RELATIVE_UNITS: Array<{ unit: Intl.RelativeTimeFormatUnit; ms: number }> = [
	{ unit: 'year', ms: 365 * 24 * 60 * 60 * 1000 },
	{ unit: 'month', ms: 30 * 24 * 60 * 60 * 1000 },
	{ unit: 'week', ms: 7 * 24 * 60 * 60 * 1000 },
	{ unit: 'day', ms: 24 * 60 * 60 * 1000 },
	{ unit: 'hour', ms: 60 * 60 * 1000 },
	{ unit: 'minute', ms: 60 * 1000 },
]

export function formatRelative(iso: string | null | undefined, now: number = Date.now()): string {
	if (!iso) return 'never'
	const d = new Date(iso)
	if (Number.isNaN(d.getTime())) return 'unknown'
	const diffMs = d.getTime() - now
	const abs = Math.abs(diffMs)
	if (abs < 60 * 1000) return 'just now'
	const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
	for (const { unit, ms } of RELATIVE_UNITS) {
		if (abs >= ms) return rtf.format(Math.round(diffMs / ms), unit)
	}
	return 'just now'
}
