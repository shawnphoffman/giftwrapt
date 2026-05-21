import { describe, expect, it } from 'vitest'

import type { AccessLevel } from '@/db/schema/enums'

import {
	buildIndices,
	classifyCell,
	classifyDependentCell,
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

	it('annotates the cell where the viewer has tagged the owner as their mother', () => {
		const { indices } = setup({
			relationLabels: [{ userId: 'bob', label: 'mother', targetUserId: 'alice', targetDependentId: null }],
		})
		const cell = classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices })
		expect(cell.parentLabels).toEqual(['mother'])
	})

	it('does NOT mirror a relation label back to the other cell (per-direction)', () => {
		// Bob says Alice is his mother. The reverse cell (Alice viewing Bob's
		// lists) carries no label - relation labels are pure annotations and
		// do not auto-tag the inverse direction.
		const { indices } = setup({
			relationLabels: [{ userId: 'bob', label: 'mother', targetUserId: 'alice', targetDependentId: null }],
		})
		expect(classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices }).parentLabels).toEqual(['mother'])
		expect(classifyCell({ viewerId: 'alice', ownerId: 'bob', ...indices }).parentLabels).toEqual([])
	})

	it('surfaces both mother and father labels on the same pair if both rows exist', () => {
		const { indices } = setup({
			relationLabels: [
				{ userId: 'bob', label: 'mother', targetUserId: 'alice', targetDependentId: null },
				{ userId: 'bob', label: 'father', targetUserId: 'alice', targetDependentId: null },
			],
		})
		const cell = classifyCell({ viewerId: 'bob', ownerId: 'alice', ...indices })
		expect(cell.parentLabels.sort()).toEqual(['father', 'mother'])
	})

	it('still annotates labels alongside a guardian / editor / denied / restricted cell', () => {
		// The label is an annotation that overlays whatever the strongest
		// access grant is; it must not be dropped by any of the early-return
		// kinds.
		const { indices } = setup({
			guardianships: [{ parentUserId: 'alice', childUserId: 'kid' }],
			relationships: [{ ownerUserId: 'alice', viewerUserId: 'carol', accessLevel: 'restricted', canEdit: false }],
			relationLabels: [
				{ userId: 'alice', label: 'mother', targetUserId: 'kid', targetDependentId: null },
				{ userId: 'carol', label: 'mother', targetUserId: 'alice', targetDependentId: null },
			],
		})
		expect(classifyCell({ viewerId: 'alice', ownerId: 'kid', ...indices }).parentLabels).toEqual(['mother'])
		expect(classifyCell({ viewerId: 'carol', ownerId: 'alice', ...indices }).parentLabels).toEqual(['mother'])
	})

	it('drops relation labels on the self cell', () => {
		// A row labeling yourself as your own mother is nonsensical and never
		// produced by the UI; classify should defensively return an empty
		// list anyway so the self diagonal stays clean.
		const { indices } = setup({
			relationLabels: [{ userId: 'alice', label: 'mother', targetUserId: 'alice', targetDependentId: null }],
		})
		expect(classifyCell({ viewerId: 'alice', ownerId: 'alice', ...indices }).parentLabels).toEqual([])
	})
})

describe('classifyDependentCell', () => {
	// `relationships` here mimics what `buildIndices().relationships` would
	// produce: a Map keyed by `${ownerUserId}|${viewerUserId}`.
	function relMap(entries: Array<[string, string, AccessLevel]>): Map<string, { accessLevel: AccessLevel; canEdit: boolean }> {
		return new Map(entries.map(([owner, viewer, accessLevel]) => [ownerViewerKey(owner, viewer), { accessLevel, canEdit: false }]))
	}
	const noLabels = new Map<string, Array<'mother' | 'father'>>()

	it('returns guardian when viewer is one of the guardians', () => {
		const cell = classifyDependentCell({
			viewerId: 'alice',
			dependentId: 'mochi',
			guardianIds: ['alice', 'bob'],
			relationships: new Map(),
			relationLabelsByDependentPair: noLabels,
		})
		expect(cell.kind).toBe('guardian')
	})

	it('returns view by default for non-guardian viewers', () => {
		const cell = classifyDependentCell({
			viewerId: 'carol',
			dependentId: 'mochi',
			guardianIds: ['alice', 'bob'],
			relationships: new Map(),
			relationLabelsByDependentPair: noLabels,
		})
		expect(cell.kind).toBe('view')
	})

	it("returns denied if ANY guardian has set the viewer to 'none'", () => {
		// Even if the other guardian shares freely, an explicit deny on
		// either guardian's userRelationship blocks the dependent.
		const cell = classifyDependentCell({
			viewerId: 'carol',
			dependentId: 'mochi',
			guardianIds: ['alice', 'bob'],
			relationships: relMap([
				['alice', 'carol', 'view'],
				['bob', 'carol', 'none'],
			]),
			relationLabelsByDependentPair: noLabels,
		})
		expect(cell.kind).toBe('denied')
	})

	it('returns restricted only when no guardian has granted view', () => {
		const cell = classifyDependentCell({
			viewerId: 'carol',
			dependentId: 'mochi',
			guardianIds: ['alice', 'bob'],
			relationships: relMap([
				['alice', 'carol', 'restricted'],
				['bob', 'carol', 'restricted'],
			]),
			relationLabelsByDependentPair: noLabels,
		})
		expect(cell.kind).toBe('restricted')
	})

	it('prefers view over restricted when guardians disagree', () => {
		// One guardian shares fully, another restricts. The most permissive
		// grant wins (mirrors canViewList: any guardian's view is sufficient
		// unless someone explicitly denied).
		const cell = classifyDependentCell({
			viewerId: 'carol',
			dependentId: 'mochi',
			guardianIds: ['alice', 'bob'],
			relationships: relMap([
				['alice', 'carol', 'view'],
				['bob', 'carol', 'restricted'],
			]),
			relationLabelsByDependentPair: noLabels,
		})
		expect(cell.kind).toBe('view')
	})

	it('never sets isPartner on a dependent cell', () => {
		// Dependents have no partner concept by design.
		const cell = classifyDependentCell({
			viewerId: 'alice',
			dependentId: 'mochi',
			guardianIds: ['alice'],
			relationships: new Map(),
			relationLabelsByDependentPair: noLabels,
		})
		expect(cell.isPartner).toBe(false)
	})

	it('always reports zero editor list count', () => {
		// Edit access on a dependent's list flows through dependentGuardianships,
		// not listEditors. The matrix shouldn't surface a list-editor count
		// for dependent cells even if such rows exist on the lists themselves.
		const cell = classifyDependentCell({
			viewerId: 'alice',
			dependentId: 'mochi',
			guardianIds: ['alice'],
			relationships: new Map(),
			relationLabelsByDependentPair: noLabels,
		})
		expect(cell.editorListCount).toBe(0)
	})

	it('surfaces relation labels keyed by viewer|dependent', () => {
		// A user can label a dependent (e.g., "Mochi is my mother's pet, but
		// also treated as my mother figure" - pathological but supported by
		// the schema). The matrix should show the label on that cell.
		const labels = new Map<string, Array<'mother' | 'father'>>([[ownerViewerKey('carol', 'mochi'), ['mother']]])
		const cell = classifyDependentCell({
			viewerId: 'carol',
			dependentId: 'mochi',
			guardianIds: ['alice', 'bob'],
			relationships: new Map(),
			relationLabelsByDependentPair: labels,
		})
		expect(cell.parentLabels).toEqual(['mother'])
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

	it('routes relation labels into user-pair vs dependent-pair maps by target type', () => {
		const data: PermissionsMatrixData = {
			users: [],
			guardianships: [],
			relationships: [],
			listEditorCounts: [],
			relationLabels: [
				{ userId: 'bob', label: 'mother', targetUserId: 'alice', targetDependentId: null },
				{ userId: 'bob', label: 'father', targetUserId: null, targetDependentId: 'mochi' },
			],
		}
		const idx = buildIndices(data)
		expect(idx.relationLabelsByUserPair.get(ownerViewerKey('bob', 'alice'))).toEqual(['mother'])
		expect(idx.relationLabelsByDependentPair.get(ownerViewerKey('bob', 'mochi'))).toEqual(['father'])
		expect(idx.relationLabelsByUserPair.get(ownerViewerKey('bob', 'mochi'))).toBeUndefined()
		expect(idx.relationLabelsByDependentPair.get(ownerViewerKey('bob', 'alice'))).toBeUndefined()
	})

	it('dedupes duplicate relation-label rows on the same pair', () => {
		// The DB has no unique constraint on (userId, label, target); the index
		// stays clean even if duplicate rows slipped in.
		const data: PermissionsMatrixData = {
			users: [],
			guardianships: [],
			relationships: [],
			listEditorCounts: [],
			relationLabels: [
				{ userId: 'bob', label: 'mother', targetUserId: 'alice', targetDependentId: null },
				{ userId: 'bob', label: 'mother', targetUserId: 'alice', targetDependentId: null },
			],
		}
		const idx = buildIndices(data)
		expect(idx.relationLabelsByUserPair.get(ownerViewerKey('bob', 'alice'))).toEqual(['mother'])
	})
})
