import type { Decorator, Meta, StoryObj } from '@storybook/react-vite'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import { EditDependentDialog } from './edit-dependent-dialog'

// Local copy of the dialog's dependent prop shape. Importing the type
// from `@/api/_dependents-impl` would pull the server-only module's
// drizzle/db chain into storybook.
type DependentForDialog = {
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

// EditDependentDialog uses `getUsersAsAdmin` to render the
// "Add guardian..." picker. Stories prime that query with a small
// fixture and force the dialog open.

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

const SAMPLE_USERS = [user('alice', 'Alice'), user('bob', 'Bob'), user('carol', 'Carol'), user('dave', 'Dave')]

function withQueryClient(): Decorator {
	return Story => {
		const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
		client.setQueryData(['admin', 'users'], SAMPLE_USERS)
		return (
			<QueryClientProvider client={client}>
				<Story />
			</QueryClientProvider>
		)
	}
}

const baseDependent: DependentForDialog = {
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
	title: 'Admin/EditDependentDialog',
	component: EditDependentDialog,
	parameters: { layout: 'centered' },
	decorators: [withQueryClient()],
} satisfies Meta<typeof EditDependentDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
	args: { dependent: baseDependent, open: true, onOpenChange: () => {} },
}

// One guardian: the row's "Remove guardian" buttons should disable on
// the only guardian (last-guardian guard) - clicking shows a toast in
// the live app, but here we just want to see the chip render with one
// guardian and the picker offering the rest.
export const SoloGuardian: Story = {
	args: {
		dependent: {
			...baseDependent,
			name: 'Whiskers',
			guardianIds: ['alice'],
			guardians: [{ id: 'alice', name: 'Alice', email: 'alice@example.test', image: null }],
		},
		open: true,
		onOpenChange: () => {},
	},
}

export const NoBirthday: Story = {
	args: {
		dependent: { ...baseDependent, birthMonth: null, birthDay: null, birthYear: null },
		open: true,
		onOpenChange: () => {},
	},
}

export const Archived: Story = {
	args: {
		dependent: { ...baseDependent, name: 'Old Yeller', isArchived: true },
		open: true,
		onOpenChange: () => {},
	},
}
