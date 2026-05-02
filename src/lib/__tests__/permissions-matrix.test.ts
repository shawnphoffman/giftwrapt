import { describe, expect, it } from 'vitest'

import {
	buildIndices,
	classifyCell,
	guardianKey,
	ownerViewerKey,
	type PermissionsMatrixData,
	type PermissionsMatrixUser,
} from '../permissions-matrix'

function user(id: string, partnerId: string | null = null): PermissionsMatrixUser {
	return { id, email: `${id}@example.test`, name: id, role: 'user', image: null, partnerId, isGuardian: false }
}

function setup(overrides: Partial<PermissionsMatrixData> = {}) {
	const data: PermissionsMatrixData = {
		users: [user('alice'), user('bob'), user('carol'), user('kid')],
		guardianships: [],
		relationships: [],
		listEditorCounts: [],
		...overrides,
	}
	return { data, indices: buildIndices(data) }
}

describe('classifyCell', () => {
	it('marks the diagonal as self and never as partner', () => {
		const { indices } = setup({
			users: [user('alice', 'bob'), user('bob', 'alice')],
		})
		const cell = classifyCell({ viewerId: 'alice', ownerId: 'alice', ...indices })
		expect(cell.kind).toBe('self')
		expect(cell.isPartner).toBe(false)
	})

	it('returns guardian when viewer is the parent of the owner', () => {
		const { indices } = setup({
			guardianships: [{ parentUserId: 'alice', childUserId: 'kid' }],
		})
		expect(classifyCell({ viewerId: 'alice', ownerId: 'kid', ...indices }).kind).toBe('guardian')
	})

	it('does not flip the guardianship direction (child has no extra access on parent)', () => {
		const { indices } = setup({
			guardianships: [{ parentUserId: 'alice', childUserId: 'kid' }],
		})
		expect(classifyCell({ viewerId: 'kid', ownerId: 'alice', ...indices }).kind).toBe('view')
	})

	it('returns denied when the owner has explicitly hidden their lists from the viewer', () => {
		const { indices } = setup({
			relationships: [{ ownerUserId: 'alice', viewerUserId: 'bob', accessLevel: 'none', canEdit: false }],
		})
		expect(classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices }).kind).toBe('denied')
	})

	it('returns restricted when the owner has set the viewer to restricted', () => {
		const { indices } = setup({
			relationships: [{ ownerUserId: 'alice', viewerUserId: 'bob', accessLevel: 'restricted', canEdit: false }],
		})
		expect(classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices }).kind).toBe('restricted')
	})

	it('returns restricted even when a stale canEdit or list-editor row is present (restricted wins)', () => {
		const { indices } = setup({
			relationships: [{ ownerUserId: 'alice', viewerUserId: 'bob', accessLevel: 'restricted', canEdit: true }],
			listEditorCounts: [{ ownerId: 'alice', userId: 'bob', count: 2 }],
		})
		const cell = classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices })
		expect(cell.kind).toBe('restricted')
		expect(cell.editorListCount).toBe(2)
	})

	it('returns editor for a user-level edit grant', () => {
		const { indices } = setup({
			relationships: [{ ownerUserId: 'alice', viewerUserId: 'bob', accessLevel: 'view', canEdit: true }],
		})
		expect(classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices }).kind).toBe('editor')
	})

	it('returns editor when only list-level grants exist', () => {
		const { indices } = setup({
			listEditorCounts: [{ ownerId: 'alice', userId: 'bob', count: 2 }],
		})
		const cell = classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices })
		expect(cell.kind).toBe('editor')
		expect(cell.editorListCount).toBe(2)
	})

	it('falls back to default view with no grants and no deny', () => {
		const { indices } = setup()
		expect(classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices }).kind).toBe('view')
	})

	it('annotates default view with list-level grant counts', () => {
		// Defensive: the current logic upgrades to editor on count > 0, but if a
		// future change separates "view + per-list grants" from "editor", this
		// test pins the count plumbing through.
		const { indices } = setup({
			listEditorCounts: [{ ownerId: 'alice', userId: 'bob', count: 3 }],
		})
		const cell = classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices })
		expect(cell.editorListCount).toBe(3)
	})

	it('prefers guardian over an explicit deny on the same pair', () => {
		// Guardianship is a stronger grant than the user-level deny in
		// canEditList; mirror that in the matrix so a guardian who also has a
		// stale deny row still reads as full access.
		const { indices } = setup({
			guardianships: [{ parentUserId: 'alice', childUserId: 'kid' }],
			relationships: [{ ownerUserId: 'kid', viewerUserId: 'alice', accessLevel: 'none', canEdit: false }],
		})
		expect(classifyCell({ viewerId: 'alice', ownerId: 'kid', ...indices }).kind).toBe('guardian')
	})

	it('prefers explicit deny over a list-level edit grant', () => {
		// If the owner has revoked view at the user level, list-level editor
		// rows should not silently restore access in the UI.
		const { indices } = setup({
			relationships: [{ ownerUserId: 'alice', viewerUserId: 'bob', accessLevel: 'none', canEdit: false }],
			listEditorCounts: [{ ownerId: 'alice', userId: 'bob', count: 1 }],
		})
		expect(classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices }).kind).toBe('denied')
	})

	it('flags partner relationship in both directions, but never on the self cell', () => {
		const { indices } = setup({
			users: [user('alice', 'bob'), user('bob', 'alice')],
		})
		expect(classifyCell({ viewerId: 'alice', ownerId: 'bob', ...indices }).isPartner).toBe(true)
		expect(classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices }).isPartner).toBe(true)
		expect(classifyCell({ viewerId: 'alice', ownerId: 'alice', ...indices }).isPartner).toBe(false)
	})

	it('preserves editorListCount for editor cells', () => {
		const { indices } = setup({
			relationships: [{ ownerUserId: 'alice', viewerUserId: 'bob', accessLevel: 'view', canEdit: true }],
			listEditorCounts: [{ ownerId: 'alice', userId: 'bob', count: 4 }],
		})
		const cell = classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices })
		expect(cell.kind).toBe('editor')
		expect(cell.editorListCount).toBe(4)
	})
})

describe('buildIndices', () => {
	it('keys guardianships as parent|child', () => {
		const data: PermissionsMatrixData = {
			users: [],
			guardianships: [{ parentUserId: 'p', childUserId: 'c' }],
			relationships: [],
			listEditorCounts: [],
		}
		const idx = buildIndices(data)
		expect(idx.guardianPairs.has(guardianKey('p', 'c'))).toBe(true)
		expect(idx.guardianPairs.has(guardianKey('c', 'p'))).toBe(false)
	})

	it('keys relationships and listEditorCounts as owner|viewer', () => {
		const data: PermissionsMatrixData = {
			users: [],
			guardianships: [],
			relationships: [{ ownerUserId: 'o', viewerUserId: 'v', accessLevel: 'view', canEdit: true }],
			listEditorCounts: [{ ownerId: 'o', userId: 'v', count: 5 }],
		}
		const idx = buildIndices(data)
		expect(idx.relationships.get(ownerViewerKey('o', 'v'))).toEqual({ accessLevel: 'view', canEdit: true })
		expect(idx.listEditorCounts.get(ownerViewerKey('o', 'v'))).toBe(5)
	})

	it('records null partnerIds explicitly so partner lookups never read undefined', () => {
		const data: PermissionsMatrixData = {
			users: [user('a'), user('b', 'a')],
			guardianships: [],
			relationships: [],
			listEditorCounts: [],
		}
		const idx = buildIndices(data)
		expect(idx.partnerOf.get('a')).toBeNull()
		expect(idx.partnerOf.get('b')).toBe('a')
	})
})
