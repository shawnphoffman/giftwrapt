import { endOfDay, startOfDay } from 'date-fns'

import { formatDate } from '@/lib/i18n/format'

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
	const withYear = { month: 'short', day: 'numeric', year: 'numeric' } as const
	if (sameDay) return formatDate(value.from, withYear)
	if (sameYear) return `${formatDate(value.from, { month: 'short', day: 'numeric' })} – ${formatDate(value.to, withYear)}`
	return `${formatDate(value.from, withYear)} – ${formatDate(value.to, withYear)}`
}

export const PRESET_DEFAULT: TimeframeValue = { kind: 'preset', preset: '6m' }

// Stable string form for things that need a serializable key, e.g.
// React Query keys. Two `TimeframeValue`s with the same effective
// window resolve to the same string.
export function serializeTimeframe(value: TimeframeValue): string {
	if (value.kind === 'preset') return value.preset
	return `custom:${startOfDay(value.from).toISOString()}:${endOfDay(value.to).toISOString()}`
}
