import { getRouterContext } from '@tanstack/react-router'
import type { PropsWithChildren } from 'react'

/**
 * Minimal mock of the TanStack Router context so components that call
 * `useRouter()` can render in Storybook. Only the methods components use in
 * rendering are implemented - click-through actions would trigger mutations
 * against stubbed APIs and then invalidate, which is harmless.
 */
const mockState = {
	location: { pathname: '/', search: '', hash: '', href: '/', searchStr: '' },
	matches: [],
	pendingMatches: [],
	status: 'idle',
	isLoading: false,
	isTransitioning: false,
	resolvedLocation: { pathname: '/', search: '', hash: '', href: '/', searchStr: '' },
}

// `useRouterState` (via @tanstack/react-store's `useStore`) reads
// `router.__store.subscribe` and `router.__store.state`. Links also call
// `useRouterState`, so we need a static store-shaped object. No updates ever
// fire, which is fine because nothing in stories navigates.
const mockStore = {
	subscribe: () => () => {},
	state: mockState,
}

const mockRouter = {
	invalidate: async () => {},
	navigate: async () => {},
	buildLocation: () => ({ href: '' }),
	subscribe: () => () => {},
	state: mockState,
	__store: mockStore,
	options: { defaultStructuralSharing: false },
}

export function MockRouterProvider({ children }: PropsWithChildren) {
	const Context = getRouterContext()
	return <Context.Provider value={mockRouter as never}>{children}</Context.Provider>
}
