import { createRouter } from '@tanstack/react-router'
import { setupRouterSsrQueryIntegration } from '@tanstack/react-router-ssr-query'

import Loading from './components/loading'
import * as TanstackQuery from './integrations/tanstack-query/root-provider'
import { setupChunkReloadHandler } from './lib/chunk-reload'
import { routeTree } from './routeTree.gen'

export const getRouter = () => {
	setupChunkReloadHandler()

	const rqContext = TanstackQuery.getContext()

	const router = createRouter({
		routeTree,
		context: { ...rqContext },
		defaultPreload: 'intent',
		defaultPendingComponent: () => <Loading />,
		Wrap: (props: { children: React.ReactNode }) => {
			return <TanstackQuery.Provider {...rqContext}>{props.children}</TanstackQuery.Provider>
		},
	})

	setupRouterSsrQueryIntegration({ router, queryClient: rqContext.queryClient })

	return router
}
