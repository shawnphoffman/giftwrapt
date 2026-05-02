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
	dependents: [
		// Mochi is co-managed by Alice + Bob (partners). The matrix shows
		// Mochi as a column on the right; both partners read as 'guardian'
		// on her cells, while Carol's cell uses the inherited deny from Bob.
		{ id: 'dep-mochi', name: 'Mochi', image: null, guardianIds: ['alice', 'bob'] },
	],
	guardianships: [
		{ parentUserId: 'alice', childUserId: 'kid' },
		{ parentUserId: 'alice', childUserId: 'teen' },
		{ parentUserId: 'bob', childUserId: 'kid' },
		{ parentUserId: 'bob', childUserId: 'teen' },
	],
	relationships: [
		// Partners share full edit on each other.
		{ ownerUserId: 'alice', viewerUserId: 'bob', accessLevel: 'view', canEdit: true },
		{ ownerUserId: 'bob', viewerUserId: 'alice', accessLevel: 'view', canEdit: true },
		// Carol is granted blanket edit on Alice's lists.
		{ ownerUserId: 'alice', viewerUserId: 'carol', accessLevel: 'view', canEdit: true },
		// Bob explicitly hides his lists from Carol. Because dependent
		// visibility inherits from each guardian's userRelationships, this
		// also denies Carol from seeing Mochi's lists (Bob is one of Mochi's
		// guardians).
		{ ownerUserId: 'bob', viewerUserId: 'carol', accessLevel: 'none', canEdit: false },
		// Alice has restricted Admin (e.g. extended-family demo) so they can
		// shop for Alice but not see what others have already bought.
		{ ownerUserId: 'alice', viewerUserId: 'admin', accessLevel: 'restricted', canEdit: false },
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

export const WithDependents: Story = {
	args: {
		data: {
			users: [user('alice', 'Alice'), user('bob', 'Bob'), user('carol', 'Carol'), user('dave', 'Dave')],
			dependents: [
				// Mochi: co-managed by Alice + Bob, no overrides -> default
				// view for outsiders.
				{ id: 'dep-mochi', name: 'Mochi', image: null, guardianIds: ['alice', 'bob'] },
				// Peanut: co-managed by Alice + Bob, but Bob has restricted
				// Carol on his own lists. Carol's cell on Peanut should read
				// 'restricted' (no guardian granted view, one set restricted).
				{ id: 'dep-peanut', name: 'Peanut', image: null, guardianIds: ['alice', 'bob'] },
				// Whiskers: solely managed by Dave who has explicitly denied
				// Carol. Carol's cell on Whiskers should read 'denied'.
				{ id: 'dep-whiskers', name: 'Whiskers', image: null, guardianIds: ['dave'] },
			],
			guardianships: [],
			relationships: [
				// Bob restricts Carol on his own lists; the restriction
				// propagates to Peanut (Bob is one of Peanut's guardians,
				// and Alice has no grant for Carol on Peanut).
				{ ownerUserId: 'bob', viewerUserId: 'carol', accessLevel: 'restricted', canEdit: false },
				// Dave denies Carol; propagates to Whiskers.
				{ ownerUserId: 'dave', viewerUserId: 'carol', accessLevel: 'none', canEdit: false },
			],
			listEditorCounts: [],
		},
	},
	parameters: {
		docs: {
			description: {
				story:
					"Three dependents demonstrating how each guardian's userRelationships propagate to the dependent column: Mochi (no overrides → default view), Peanut (Bob's restricted on Carol propagates), Whiskers (Dave's deny on Carol propagates). The dependent rows on the left are absent because dependents never act as viewers.",
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
					.map(viewer => ({ ownerUserId: owner.id, viewerUserId: viewer.id, accessLevel: 'none', canEdit: false }))
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

function buildLargeOrg(): PermissionsMatrixData {
	const users: Array<PermissionsMatrixUser> = []
	const guardianships: PermissionsMatrixData['guardianships'] = []
	const relationships: PermissionsMatrixData['relationships'] = []
	const listEditorCounts: PermissionsMatrixData['listEditorCounts'] = []

	const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

	// 1 admin
	users.push(user('admin', 'Admin', 'admin'))

	// 5 partner pairs (10 users) - each pair shares full view+edit both ways
	const partnerPairs: Array<[string, string]> = [
		['alice', 'bob'],
		['carol', 'dave'],
		['eve', 'frank'],
		['grace', 'henry'],
		['ivy', 'jack'],
	]
	for (const [a, b] of partnerPairs) {
		users.push(user(a, cap(a), 'user', b))
		users.push(user(b, cap(b), 'user', a))
		relationships.push({ ownerUserId: a, viewerUserId: b, accessLevel: 'view', canEdit: true })
		relationships.push({ ownerUserId: b, viewerUserId: a, accessLevel: 'view', canEdit: true })
	}

	// 8 children, each cycled through guardian pairs (so most have 2 guardians)
	const kids = ['kiddo', 'teen', 'baby', 'junior', 'minor', 'youngling', 'pup', 'cub']
	kids.forEach((kid, i) => {
		users.push(user(kid, cap(kid), 'child'))
		const [g1, g2] = partnerPairs[i % partnerPairs.length]
		guardianships.push({ parentUserId: g1, childUserId: kid })
		guardianships.push({ parentUserId: g2, childUserId: kid })
	})

	// 31 regular users to round out to 50
	const extras = [
		'liam',
		'mia',
		'noah',
		'olivia',
		'parker',
		'quinn',
		'rachel',
		'sam',
		'tara',
		'uma',
		'vince',
		'wendy',
		'xander',
		'yara',
		'zoe',
		'amber',
		'blake',
		'colin',
		'dana',
		'ethan',
		'fiona',
		'gus',
		'hank',
		'iris',
		'jade',
		'kyle',
		'lola',
		'max',
		'nina',
		'orion',
		'piper',
	]
	for (const name of extras) {
		users.push(user(name, cap(name)))
	}

	// Sprinkle additional grants: a few extended-family-style edit grants
	relationships.push({ ownerUserId: 'alice', viewerUserId: 'carol', accessLevel: 'view', canEdit: true })
	relationships.push({ ownerUserId: 'liam', viewerUserId: 'mia', accessLevel: 'view', canEdit: true })
	relationships.push({ ownerUserId: 'mia', viewerUserId: 'liam', accessLevel: 'view', canEdit: true })
	relationships.push({ ownerUserId: 'noah', viewerUserId: 'olivia', accessLevel: 'view', canEdit: true })
	relationships.push({ ownerUserId: 'tara', viewerUserId: 'sam', accessLevel: 'view', canEdit: true })

	// And a handful of denies (distant in-laws, etc.)
	relationships.push({ ownerUserId: 'alice', viewerUserId: 'orion', accessLevel: 'none', canEdit: false })
	relationships.push({ ownerUserId: 'bob', viewerUserId: 'piper', accessLevel: 'none', canEdit: false })
	relationships.push({ ownerUserId: 'carol', viewerUserId: 'max', accessLevel: 'none', canEdit: false })
	relationships.push({ ownerUserId: 'eve', viewerUserId: 'gus', accessLevel: 'none', canEdit: false })
	relationships.push({ ownerUserId: 'liam', viewerUserId: 'admin', accessLevel: 'none', canEdit: false })
	relationships.push({ ownerUserId: 'fiona', viewerUserId: 'hank', accessLevel: 'none', canEdit: false })

	// A few restricted-tier grants (the spoiler-protected "shop but don't see
	// others' purchases" relationships).
	relationships.push({ ownerUserId: 'alice', viewerUserId: 'gus', accessLevel: 'restricted', canEdit: false })
	relationships.push({ ownerUserId: 'noah', viewerUserId: 'admin', accessLevel: 'restricted', canEdit: false })
	relationships.push({ ownerUserId: 'eve', viewerUserId: 'piper', accessLevel: 'restricted', canEdit: false })

	// List-level editor grants overlap with some user-level grants and stand alone in others
	listEditorCounts.push({ ownerId: 'alice', userId: 'carol', count: 3 })
	listEditorCounts.push({ ownerId: 'alice', userId: 'admin', count: 1 })
	listEditorCounts.push({ ownerId: 'bob', userId: 'admin', count: 2 })
	listEditorCounts.push({ ownerId: 'carol', userId: 'dave', count: 1 })
	listEditorCounts.push({ ownerId: 'liam', userId: 'mia', count: 5 })
	listEditorCounts.push({ ownerId: 'noah', userId: 'liam', count: 1 })
	listEditorCounts.push({ ownerId: 'tara', userId: 'uma', count: 2 })
	listEditorCounts.push({ ownerId: 'wendy', userId: 'xander', count: 1 })
	listEditorCounts.push({ ownerId: 'amber', userId: 'blake', count: 4 })
	listEditorCounts.push({ ownerId: 'iris', userId: 'jade', count: 2 })

	return { users, guardianships, relationships, listEditorCounts }
}

export const LargeOrg: Story = {
	args: { data: buildLargeOrg() },
	parameters: {
		docs: {
			description: {
				story:
					'50 users: 1 admin, 5 partner pairs (10), 8 children with shared guardians, and 31 extended-family/non-related users. Sprinkled with edit grants, denies, and list-level editor counts. Useful for stress-testing density, scroll behavior, and how the legend reads against a dense matrix.',
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
