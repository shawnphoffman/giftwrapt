import type { Priority } from '@/db/schema/enums'

// Priority-specific ring color override. Pair with a base `ring-1 ring-inset
// ring-border` on the container — the later priority class wins the cascade
// and swaps just the ring color for priority rows. Normal priority is the
// default neutral ring.
export const priorityRingClass: Record<Priority, string> = {
	'very-high': 'ring-yellow-400/40',
	high: 'ring-orange-500/40',
	low: 'ring-blue-400/40',
	normal: '',
}

// Priority-tab backgrounds for the full-height "peek" tab on the left side of
// a group or standalone item on the edit page. Normal priority has no tab.
export const priorityTabBgClass: Record<Priority, string> = {
	'very-high': 'bg-yellow-400/80 text-yellow-950',
	high: 'bg-orange-500/80 text-orange-50',
	low: 'bg-blue-400/80 text-blue-950',
	normal: '',
}
