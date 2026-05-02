import { endOfDay, format, startOfDay } from 'date-fns'

export type TimeframePreset = '30d' | '60d' | '6m' | '12m' | 'all'

export type TimeframeValue = { kind: 'preset'; preset: TimeframePreset } | { kind: 'custom'; from: Date; to: Date }

export const TIMEFRAME_PRESETS: ReadonlyArray<{ value: TimeframePreset; label: string }> = [
	{ value: '30d', label: 'Last 30 days' },
	{ value: '60d', label: 'Last 60 days' },
	{ value: '6m', label: 'Last 6 months' },
	{ value: '12m', label: 'Last 12 months' },
	{ value: 'all', label: 'All time' },
] as const

export function presetCutoff(preset: TimeframePreset): Date | null {
	if (preset === 'all') return null
	const now = Date.now()
	switch (preset) {
		case '30d':
			return new Date(now - 30 * 24 * 60 * 60 * 1000)
		case '60d':
			return new Date(now - 60 * 24 * 60 * 60 * 1000)
		case '6m': {
			const d = new Date()
			d.setMonth(d.getMonth() - 6)
			return d
		}
		case '12m': {
			const d = new Date()
			d.setFullYear(d.getFullYear() - 1)
			return d
		}
	}
}

export function matchesTimeframe(date: Date | string, value: TimeframeValue): boolean {
	const d = typeof date === 'string' ? new Date(date) : date
	if (value.kind === 'preset') {
		const cutoff = presetCutoff(value.preset)
		if (!cutoff) return true
		return d >= cutoff
	}
	const from = startOfDay(value.from).getTime()
	const to = endOfDay(value.to).getTime()
	const t = d.getTime()
	return t >= from && t <= to
}

export function formatTimeframeLabel(value: TimeframeValue): string {
	if (value.kind === 'preset') {
		const found = TIMEFRAME_PRESETS.find(p => p.value === value.preset)
		return found ? found.label : 'All time'
	}
	const sameYear = value.from.getFullYear() === value.to.getFullYear()
	const sameDay = startOfDay(value.from).getTime() === startOfDay(value.to).getTime()
	if (sameDay) return format(value.from, 'MMM d, yyyy')
	if (sameYear) return `${format(value.from, 'MMM d')} – ${format(value.to, 'MMM d, yyyy')}`
	return `${format(value.from, 'MMM d, yyyy')} – ${format(value.to, 'MMM d, yyyy')}`
}

export const PRESET_DEFAULT: TimeframeValue = { kind: 'preset', preset: '6m' }
