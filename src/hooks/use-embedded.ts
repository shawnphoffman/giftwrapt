import { useRouterState } from '@tanstack/react-router'

/**
 * Whether this page is rendered inside the iOS app's web tab (plan 28).
 *
 * Reads the flag the root route's loader computed from the User-Agent, so
 * SSR and the hydrated client agree and nothing flickers. Selecting off
 * router state (rather than `useLoaderData({ from: '__root__' })`) keeps
 * the hook harmless in Storybook's mock router, where there are no matches.
 */
export function useEmbedded(): boolean {
	return useRouterState({
		select: s => {
			const root = s.matches.find(m => m.routeId === '__root__')
			const data = root?.loaderData as { embedded?: boolean } | undefined
			return data?.embedded === true
		},
	})
}
