import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { CreateDependentForm } from './create-dependent-form'

// CreateDependentForm pulls users via `getUsersAsAdmin` to populate the
// guardian picker. Stories prime that query with a small fixture.

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

function withUsers(users: Array<AdminUserRow>): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(['admin', 'users'], users)
		return (
			<QueryClientProvider client={client}>
				<div className="max-w-xl">
					<Story />
				</div>
			</QueryClientProvider>
		)
	}
}

const meta = {
	title: 'Admin/CreateDependentForm',
	component: CreateDependentForm,
	parameters: { layout: 'padded' },
	args: { onCreated: () => {} },
} satisfies Meta<typeof CreateDependentForm>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	decorators: [withUsers([user('alice', 'Alice'), user('bob', 'Bob'), user('carol', 'Carol'), user('dave', 'Dave')])],
}

// The picker filters out child-role users (they can't be guardians).
// A run with a child user mixed in should show the same set as
// 'Default' above.
export const FiltersOutChildren: Story = {
	decorators: [withUsers([user('alice', 'Alice'), user('bob', 'Bob'), user('kid', 'Kiddo', 'child'), user('teen', 'Teen', 'child')])],
}

export const NoEligibleGuardians: Story = {
	decorators: [withUsers([user('kid', 'Kiddo', 'child')])],
}
