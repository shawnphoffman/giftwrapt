import type { TimeframeValue } from '@/lib/timeframe'

export { PresetsPlusCustomList } from './presets-plus-custom-list'

export type VariantProps = {
	value: TimeframeValue
	onChange: (next: TimeframeValue) => void
}
