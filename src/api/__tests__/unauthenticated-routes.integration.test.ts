// A signed-out request is an expected condition, not a server fault: these
// routes answer 401 rather than throwing, which surfaced as a 500.

import { describe, expect, it } from 'vitest'

import { Route as PublicLists } from '@/routes/api/lists/public'
import { Route as PublicDependents } from '@/routes/api/lists/public-dependents'
import { Route as UpcomingHolidays } from '@/routes/api/widgets/upcoming-holidays'

type GetHandler = (ctx: { request: Request }) => Promise<Response>

function getHandler(route: { options: unknown }): GetHandler {
	return (route.options as { server: { handlers: { GET: GetHandler } } }).server.handlers.GET
}

describe('JSON feeds without a session', () => {
	it.each([
		['/api/lists/public', PublicLists],
		['/api/lists/public-dependents', PublicDependents],
		['/api/widgets/upcoming-holidays', UpcomingHolidays],
	])('%s answers 401', async (path, route) => {
		const res = await getHandler(route)({ request: new Request(`http://localhost:3001${path}`) })

		expect(res.status).toBe(401)
		expect(await res.json()).toEqual({ error: 'Unauthorized' })
	})
})
