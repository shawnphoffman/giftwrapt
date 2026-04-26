export const AVATAR_COLORS = [
	'bg-red-500 dark:bg-red-600',
	'bg-orange-600 dark:bg-orange-700',
	'bg-rose-500 dark:bg-rose-600',
	'bg-pink-500 dark:bg-pink-600',
	'bg-fuchsia-500 dark:bg-fuchsia-600',
	'bg-purple-500 dark:bg-purple-600',
	'bg-violet-500 dark:bg-violet-600',
	'bg-indigo-500 dark:bg-indigo-600',
	'bg-blue-500 dark:bg-blue-600',
	'bg-sky-600 dark:bg-sky-700',
	'bg-cyan-600 dark:bg-cyan-700',
	'bg-teal-600 dark:bg-teal-700',
] as const

export function avatarColorClass(seed: string): string {
	let hash = 5381
	for (let i = 0; i < seed.length; i++) {
		hash = ((hash << 5) + hash + seed.charCodeAt(i)) | 0
	}
	return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
