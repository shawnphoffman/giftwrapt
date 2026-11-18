// Must come before any import that may call crypto.randomUUID at module load
// (e.g. @tanstack/db collections constructed in src/db-collections/*).
import './lib/random-uuid-polyfill'

import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import Loading from './components/loading'
import { RouteErrorFallback } from './components/utilities/route-error-fallback'
import * as TanstackQuery from './integrations/tanstack-query/root-provider'
import { setupChunkReloadHandler } from './lib/chunk-reload'
import { installClientLocaleStrategy } from './lib/i18n/client'
import NotFound from './routes/-not-found'
import { routeTree } from './routeTree.gen'

export const getRouter = () => {
	setupChunkReloadHandler()
	// Before anything renders: message functions ask the strategy for the
	// locale on first use.
	installClientLocaleStrategy()

	const rqContext = TanstackQuery.getContext()

	const router = createRouter({
		routeTree,
		context: { ...rqContext },
		defaultPreload: 'intent',
		defaultPendingMs: 400,
		defaultPendingMinMs: 300,
		defaultPendingComponent: () => (
			<div className="flex items-center justify-center w-full min-h-screen">
				<Loading />
			</div>
		),
		defaultErrorComponent: ({ error, reset }) => <RouteErrorFallback error={error} reset={reset} />,
		defaultNotFoundComponent: () => <NotFound />,
		Wrap: (props: { children: React.ReactNode }) => {
			return <TanstackQuery.Provider {...rqContext}>{props.children}</TanstackQuery.Provider>
		},
	})

	setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient })

	return router
}
