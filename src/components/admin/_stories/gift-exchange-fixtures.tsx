// Sample data and decorators for the admin gift exchange stories. Nothing
// here talks to a server: `@/api/gift-exchanges` and `@/api/admin` are the
// Storybook stubs, and the users query is primed below.

import type { Decorator } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { AdminExchangeDetail, AdminExchangeMember } from '@/api/_gift-exchanges-impl'
import { buildAllowedRelation, checkDraw, type MemberPair } from '@/lib/gift-exchange/draw'
import type { LockedPair } from '@/lib/gift-exchange/rules'

type Role = 'user' | 'admin' | 'child'

function member(id: string, name: string, role: Role = 'user'): AdminExchangeMember {
	return { id, userId: `u-${id}`, name, email: `${id}@example.test`, image: null, role, banned: false }
}

export const MEMBERS: Array<AdminExchangeMember> = [
	member('nora', 'Nora Whitfield', 'admin'),
	member('ben', 'Ben Whitfield'),
	member('maya', 'Maya Whitfield', 'child'),
	member('theo', 'Theo Whitfield', 'child'),
	member('ruth', 'Ruth Whitfield'),
	member('alex', 'Alexandra Montgomery-Fitzgerald'),
	member('dana', 'Dana Okafor'),
	member('omar', 'Omar Haddad'),
]

// Maya and Theo are Nora and Ben's children; Omar set Dana to none.
export const LOCKED: Array<LockedPair> = [
	{ giverMemberId: 'maya', recipientMemberId: 'nora', reason: 'giver-is-child-of-recipient' },
	{ giverMemberId: 'maya', recipientMemberId: 'ben', reason: 'giver-is-child-of-recipient' },
	{ giverMemberId: 'theo', recipientMemberId: 'nora', reason: 'giver-is-child-of-recipient' },
	{ giverMemberId: 'theo', recipientMemberId: 'ben', reason: 'giver-is-child-of-recipient' },
	{ giverMemberId: 'dana', recipientMemberId: 'omar', reason: 'recipient-denies-giver' },
]

// Nora and Ben don't gift to each other; the children don't gift to Ruth.
export const BLOCKED: Array<MemberPair> = [
	{ giverMemberId: 'nora', recipientMemberId: 'ben' },
	{ giverMemberId: 'ben', recipientMemberId: 'nora' },
	{ giverMemberId: 'maya', recipientMemberId: 'ruth' },
	{ giverMemberId: 'theo', recipientMemberId: 'ruth' },
]

/** An exchange whose draw check is computed from its own rules, like the server's read. */
export function exchange(overrides: Partial<AdminExchangeDetail> = {}): AdminExchangeDetail {
	const base: AdminExchangeDetail = {
		id: 'ex-1',
		name: 'Christmas 2026',
		budget: 50,
		budgetCurrency: 'USD',
		giftDate: '2026-12-25',
		state: 'not-drawn',
		drawnAt: null,
		archivedAt: null,
		members: MEMBERS,
		blocked: BLOCKED,
		locked: LOCKED,
		drawCheck: null,
		anyoneHasLooked: false,
		notEmailedCount: 8,
		pairings: null,
		...overrides,
	}
	if (base.state !== 'archived' && !('drawCheck' in overrides)) {
		const ids = base.members.map(x => x.id)
		base.drawCheck = checkDraw(ids, buildAllowedRelation(ids, [...base.locked, ...base.blocked]))
	}
	return base
}

/** Ruth has turned everyone off: she has nobody to gift to. */
export const RUTH_STUCK: Array<MemberPair> = [
	...BLOCKED,
	...MEMBERS.filter(x => x.id !== 'ruth').map(x => ({ giverMemberId: 'ruth', recipientMemberId: x.id })),
]

/** Ruth, Dana and Omar can only gift to Nora and Ben. */
export const THREE_FOR_TWO: Array<MemberPair> = [
	...BLOCKED,
	...['ruth', 'dana', 'omar'].flatMap(giver =>
		['maya', 'theo', 'ruth', 'alex', 'dana', 'omar'].filter(r => r !== giver).map(r => ({ giverMemberId: giver, recipientMemberId: r }))
	),
]

export const PAIRINGS: Array<MemberPair> = [
	{ giverMemberId: 'nora', recipientMemberId: 'maya' },
	{ giverMemberId: 'maya', recipientMemberId: 'alex' },
	{ giverMemberId: 'alex', recipientMemberId: 'theo' },
	{ giverMemberId: 'theo', recipientMemberId: 'ruth' },
	{ giverMemberId: 'ruth', recipientMemberId: 'ben' },
	{ giverMemberId: 'ben', recipientMemberId: 'omar' },
	{ giverMemberId: 'omar', recipientMemberId: 'dana' },
	{ giverMemberId: 'dana', recipientMemberId: 'nora' },
]

// Users the Add Person picker offers (getUsersAsAdmin's shape, trimmed).
const USERS = [
	...MEMBERS.map(x => ({ id: x.userId!, name: x.name, email: x.email!, image: null, role: x.role!, banned: false })),
	{ id: 'u-sam', name: 'Sam Whitfield', email: 'sam@example.test', image: null, role: 'child' as const, banned: false },
	{ id: 'u-lee', name: 'Lee Park', email: 'lee@example.test', image: null, role: 'user' as const, banned: false },
	{ id: 'u-banned', name: 'Banned Person', email: 'banned@example.test', image: null, role: 'user' as const, banned: true },
]

export const withExchangeQueries: Decorator = Story => {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } })
	client.setQueryData(['admin', 'users'], USERS)
	return (
		<QueryClientProvider client={client}>
			<Story />
		</QueryClientProvider>
	)
}

/** The admin content column, so the `@container/admin-content` queries apply. */
export const withAdminColumn: Decorator = Story => (
	<div className="@container/admin-content flex flex-col gap-6">
		<Story />
	</div>
)
