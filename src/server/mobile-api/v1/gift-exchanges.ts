// Gift exchanges (Secret Santa, plan 39, slice 39f) for the iOS Upcoming tab
// and the Coming Up widget.
//
//   GET /v1/gift-exchanges
//
// One row per drawn, unarchived exchange the caller is a member of, soonest
// gift date first:
//
//   { rows: [{ id, name, giftDate, budget, state }], nextCursor: null }
//
// `giftDate` is date-only `YYYY-MM-DD`. `budget` is null or
// `{ amount, currency }`. `state` is `ready` | `seen` | `changed`.
//
// Secrecy: no row ever names the person the caller gives to, or any other
// person, so the name cannot reach a widget or the phone's caches. The
// person is shown only on the web Gift Exchange page (the Lists tab), after
// See Who You Have. Reading this route is not looking: it never calls a
// reveal and never stamps `seenAt`.
//
// Bounded by the caller's memberships (a handful), so no cursor; the
// `nextCursor: null` matches the widget feed's shape.

import type { Hono } from 'hono'

import { getMyExchangesImpl, type MyExchangeState } from '@/api/_my-gift-exchanges-impl'
import { db } from '@/db'
import { getAppSettings } from '@/lib/settings-loader'

import type { MobileAuthContext } from '../auth'

type App = Hono<MobileAuthContext>

export type MobileGiftExchangeRow = {
	id: string
	name: string
	/** A calendar date, `YYYY-MM-DD`. */
	giftDate: string
	budget: { amount: number; currency: string } | null
	state: MyExchangeState
}

export function registerGiftExchangeRoutes(v1: App): void {
	v1.get('/gift-exchanges', async c => {
		const userId = c.get('userId')
		const { exchanges } = await getMyExchangesImpl({ userId, dbx: db })
		// A budget always carries its currency once saved; the deployment
		// default only covers a row written before that was true.
		const fallbackCurrency = exchanges.some(x => x.budget !== null && x.budgetCurrency === null)
			? (await getAppSettings(db)).defaultCurrency
			: null
		// Built field by field so nothing else from the impl (the recipient,
		// once the caller has looked) can ride along.
		const rows: Array<MobileGiftExchangeRow> = exchanges.map(x => ({
			id: x.id,
			name: x.name,
			giftDate: x.giftDate,
			budget: x.budget === null ? null : { amount: x.budget, currency: x.budgetCurrency ?? fallbackCurrency ?? 'USD' },
			state: x.state,
		}))
		return c.json({ rows, nextCursor: null })
	})
}
