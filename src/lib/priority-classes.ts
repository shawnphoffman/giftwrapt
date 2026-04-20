import type { Priority } from '@/db/schema/enums'

export const priorityRingClass: Record<Priority, string> = {
	'very-high': 'ring-2 ring-inset ring-yellow-400/40',
	high: 'ring-2 ring-inset ring-orange-500/40',
	low: 'ring-2 ring-inset ring-blue-400/40',
	normal: '',
}
