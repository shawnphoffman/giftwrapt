import { useRouterState } from '@tanstack/react-router'

import { DEFAULT_TEXT_SIZE, type TextSize } from '@/lib/text-size'

/**
 * The text size this page rendered at (plan 30c), from the root loader, so
 * SSR and the hydrated client agree. Selecting off router state keeps it
 * harmless in Storybook's mock router, where it reads as the default.
 */
export function useTextSize(): TextSize {
	return useRouterState({
		select: s => {
			const root = s.matches.find(m => m.routeId === '__root__')
			const data = root?.loaderData as { textSize?: TextSize } | undefined
			return data?.textSize ?? DEFAULT_TEXT_SIZE
		},
	})
}
