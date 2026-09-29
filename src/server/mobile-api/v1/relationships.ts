// User relationships - read-only person directory for MCP. The
// privacy controls behind axes 1 and 2 from `docs/logic.md` are
// managed on the web only.

import type { Hono } from 'hono'

import { getMyPeopleImpl } from '@/api/_permissions-impl'
import { db } from '@/db'

import type { MobileAuthContext } from '../auth'

type App = Hono<MobileAuthContext>

export function registerRelationshipRoutes(v1: App): void {
	// GET /v1/me/people - consolidated person directory used by the
	// mobile/MCP clients to populate person pickers and resolve names
	// without three round-trips. Returns every other user with computed
	// flags for the four pairwise visibility/edit dimensions plus
	// partner status. See `getMyPeopleImpl` in
	// `src/api/_permissions-impl.ts` for the field semantics.
	v1.get('/me/people', async c => {
		const currentUserId = c.get('userId')
		const people = await getMyPeopleImpl(db, currentUserId)
		return c.json({ people })
	})
}
