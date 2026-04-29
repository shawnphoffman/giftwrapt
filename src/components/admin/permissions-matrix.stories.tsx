import type { Meta, StoryObj } from '@storybook/react-vite'

import type { PermissionsMatrixData, PermissionsMatrixUser } from '@/lib/permissions-matrix'

import { PermissionsMatrixView } from './permissions-matrix-view'

/**
 * Admin permissions matrix. Rows = viewer, columns = list owner. Each cell
 * shows the strongest permission the viewer has on the owner's lists, with
 * `+N` annotations for list-level editor grants and a heart overlay for
 * partners.
 */
const meta = {
	title: 'Admin/Permissions Matrix',
	component: PermissionsMatrixView,
	parameters: { layout: 'padded' },
} satisfies Meta<typeof PermissionsMatrixView>

export default meta
type Story = StoryObj<typeof meta>

function user(id: string, name: string, role: 'user' | 'admin' | 'child' = 'user', partnerId: string | null = null): PermissionsMatrixUser {
	return {
		id,
		email: `${id}@example.test`,
		name,
		role,
		image: null,
		partnerId,
		isGuardian: false,
	}
}

const sixUsers: Array<PermissionsMatrixUser> = [
	user('admin', 'Admin', 'admin'),
	user('alice', 'Alice', 'user', 'bob'),
	user('bob', 'Bob', 'user', 'alice'),
	user('carol', 'Carol'),
	user('kid', 'Kiddo', 'child'),
	user('teen', 'Teen', 'child'),
]

const baseHousehold: PermissionsMatrixData = {
	users: sixUsers,
	guardianships: [
		{ parentUserId: 'alice', childUserId: 'kid' },
		{ parentUserId: 'alice', childUserId: 'teen' },
		{ parentUserId: 'bob', childUserId: 'kid' },
		{ parentUserId: 'bob', childUserId: 'teen' },
	],
	relationships: [
		// Partners share full edit on each other.
		{ ownerUserId: 'alice', viewerUserId: 'bob', canView: true, canEdit: true },
		{ ownerUserId: 'bob', viewerUserId: 'alice', canView: true, canEdit: true },
		// Carol is granted blanket edit on Alice's lists.
		{ ownerUserId: 'alice', viewerUserId: 'carol', canView: true, canEdit: true },
		// Bob explicitly hides his lists from Carol.
		{ ownerUserId: 'bob', viewerUserId: 'carol', canView: false, canEdit: false },
	],
	listEditorCounts: [
		// Carol also has list-level edit on two of Alice's lists (overlaps the user-level grant: +N still annotated).
		{ ownerId: 'alice', userId: 'carol', count: 2 },
		// Admin has a single list-level edit on Bob's lists, with no other grants.
		{ ownerId: 'bob', userId: 'admin', count: 1 },
	],
}

export const Household: Story = {
	args: { data: baseHousehold },
	parameters: {
		docs: {
			description: {
				story:
					'A small household: Alice + Bob are partners and guardians of Kiddo + Teen. Carol has blanket edit on Alice and is denied by Bob. Admin has one list-level edit grant on Bob.',
			},
		},
	},
}

export const Empty: Story = {
	args: {
		data: {
			users: [],
			guardianships: [],
			relationships: [],
			listEditorCounts: [],
		},
	},
	parameters: {
		docs: {
			description: { story: 'Fresh deployment, no users yet. Component falls back to a "No users found" message.' },
		},
	},
}

export const SingleUser: Story = {
	args: {
		data: {
			users: [user('admin', 'Admin', 'admin')],
			guardianships: [],
			relationships: [],
			listEditorCounts: [],
		},
	},
	parameters: {
		docs: { description: { story: 'Only one user exists - the matrix degenerates to a single self cell on the diagonal.' } },
	},
}

export const NoRelationships: Story = {
	args: {
		data: {
			users: sixUsers,
			guardianships: [],
			relationships: [],
			listEditorCounts: [],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					'No guardianships or grants configured. Every off-diagonal cell falls back to the default "view" (public + active lists), making it easy to spot when permissions are bare.',
			},
		},
	},
}

export const HeavyDenies: Story = {
	args: {
		data: {
			users: sixUsers,
			guardianships: [],
			relationships: sixUsers.flatMap(owner =>
				sixUsers
					.filter(viewer => viewer.id !== owner.id)
					.map(viewer => ({ ownerUserId: owner.id, viewerUserId: viewer.id, canView: false, canEdit: false }))
			),
			listEditorCounts: [],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					'Worst-case privacy lockdown: every owner has explicitly denied every other user. The matrix is a wall of red except on the diagonal. Useful for spotting whether the deny styling is loud enough.',
			},
		},
	},
}

export const ListEditorsOnly: Story = {
	args: {
		data: {
			users: sixUsers,
			guardianships: [],
			relationships: [],
			listEditorCounts: [
				{ ownerId: 'alice', userId: 'carol', count: 1 },
				{ ownerId: 'alice', userId: 'admin', count: 3 },
				{ ownerId: 'bob', userId: 'carol', count: 5 },
			],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					'No user-level grants - just per-list editors. The cells render as "editor" with the +N badge so you can see how many specific lists were granted.',
			},
		},
	},
}
