import type { PropsWithChildren } from 'react'

import { getRouterContext } from '@tanstack/react-router'

/**
 * Minimal mock of the TanStack Router context so components that call
 * `useRouter()` can render in Storybook. Only the methods components use in
 * rendering are implemented — click-through actions would trigger mutations
 * against stubbed APIs and then invalidate, which is harmless.
 */
const mockRouter = {
	invalidate: async () => {},
	navigate: async () => {},
	buildLocation: () => ({ href: '' }),
	subscribe: () => () => {},
	state: { location: { pathname: '/', search: '', hash: '' } },
}

export function MockRouterProvider({ children }: PropsWithChildren) {
	const Context = getRouterContext()
	return <Context.Provider value={mockRouter as never}>{children}</Context.Provider>
}
