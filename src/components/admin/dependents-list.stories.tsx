import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { AdminDependentsList } from './dependents-list'

// Local copy of the AdminDependentRow shape - importing the type from
// `@/api/_dependents-impl` would pull the server-only module's import
// chain (db, drizzle ops) into the storybook bundle.
type AdminDependentRow = {
	id: string
	name: string
	image: string | null
	birthMonth:
		| 'january'
		| 'february'
		| 'march'
		| 'april'
		| 'may'
		| 'june'
		| 'july'
		| 'august'
		| 'september'
		| 'october'
		| 'november'
		| 'december'
		| null
	birthDay: number | null
	birthYear: number | null
	isArchived: boolean
	guardianIds: Array<string>
	guardians: Array<{ id: string; name: string | null; email: string; image: string | null }>
	createdAt: string
	updatedAt: string
}

// AdminDependentsList issues two server fns (`getAllDependents`,
// `getUsersAsAdmin`) on mount. Storybook can't reach the server, so each
// variant primes a fresh QueryClient with the data both queries expect.

type AdminUserRow = {
	id: string
	email: string
	name: string | null
	role: 'user' | 'admin' | 'child'
	image: string | null
	birthMonth: string | null
	birthDay: number | null
	birthYear: number | null
	banned: boolean
	twoFactorEnabled: boolean
	emailVerified: boolean
	partnerId: string | null
	createdAt: Date
	updatedAt: Date
	guardians: Array<{ id: string; email: string; name: string | null; image: string | null }>
	partner: { id: string; email: string; name: string | null; image: string | null } | null
	isGuardian: boolean
}

function user(id: string, name: string, role: 'user' | 'admin' | 'child' = 'user'): AdminUserRow {
	return {
		id,
		email: `${id}@example.test`,
		name,
		role,
		image: null,
		birthMonth: null,
		birthDay: null,
		birthYear: null,
		banned: false,
		twoFactorEnabled: false,
		emailVerified: true,
		partnerId: null,
		createdAt: new Date('2026-01-01'),
		updatedAt: new Date('2026-01-01'),
		guardians: [],
		partner: null,
		isGuardian: false,
	}
}

const SAMPLE_USERS = [user('alice', 'Alice'), user('bob', 'Bob'), user('carol', 'Carol')]

function withInitialData(dependents: Array<AdminDependentRow>): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(['admin', 'dependents'], { dependents })
		client.setQueryData(['admin', 'users'], SAMPLE_USERS)
		return (
			<QueryClientProvider client={client}>
				<div className="@container/admin-content max-w-3xl">
					<Story />
				</div>
			</QueryClientProvider>
		)
	}
}

const baseDependent: AdminDependentRow = {
	id: 'dep-mochi',
	name: 'Mochi',
	image: null,
	birthMonth: 'march',
	birthDay: 12,
	birthYear: 2022,
	isArchived: false,
	guardianIds: ['alice', 'bob'],
	guardians: [
		{ id: 'alice', name: 'Alice', email: 'alice@example.test', image: null },
		{ id: 'bob', name: 'Bob', email: 'bob@example.test', image: null },
	],
	createdAt: '2026-04-01T00:00:00Z',
	updatedAt: '2026-04-01T00:00:00Z',
}

const meta = {
	title: 'Admin/AdminDependentsList',
	component: AdminDependentsList,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof AdminDependentsList>

export default meta
type Story = StoryObj<typeof meta>

export const Populated: Story = {
	decorators: [
		withInitialData([
			baseDependent,
			{
				...baseDependent,
				id: 'dep-peanut',
				name: 'Peanut',
				birthMonth: 'september',
				birthDay: 1,
				birthYear: 2025,
				guardianIds: ['alice'],
				guardians: [{ id: 'alice', name: 'Alice', email: 'alice@example.test', image: null }],
			},
		]),
	],
}

export const SoloGuardian: Story = {
	decorators: [
		withInitialData([
			{
				...baseDependent,
				name: 'Whiskers',
				guardianIds: ['alice'],
				guardians: [{ id: 'alice', name: 'Alice', email: 'alice@example.test', image: null }],
			},
		]),
	],
}

export const Archived: Story = {
	decorators: [withInitialData([{ ...baseDependent, name: 'Old Yeller', isArchived: true }])],
}

export const NoBirthday: Story = {
	decorators: [withInitialData([{ ...baseDependent, birthMonth: null, birthDay: null, birthYear: null }])],
}

export const Empty: Story = {
	decorators: [withInitialData([])],
}
