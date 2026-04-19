import type { Priority } from '@/db/schema/enums'

export const priorityBorderClass: Record<Priority, string> = {
	'very-high': 'border-yellow-400/30',
	high: 'border-orange-500/30',
	low: 'border-blue-400/30',
	normal: '',
}
