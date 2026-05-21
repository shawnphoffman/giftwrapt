// Pure helpers for the admin permissions matrix.
//
// `classifyCell` decides what a single matrix cell should display: the
// strongest grant the viewer has on the owner's lists, plus annotations for
// per-list editor grants and the partner relationship. The resolution order
// mirrors `canEditList` / `canViewList` in `@/lib/permissions`:
//   self > guardian > explicit deny > restricted > user-level edit > list-level edit > default view
// Partner is an annotation, not a permission, because partnership alone
// doesn't grant view/edit beyond the public default.

import type { AccessLevel, RelationLabel } from '@/db/schema/enums'

export type CellKind = 'self' | 'guardian' | 'editor' | 'view' | 'denied' | 'restricted'

export type Cell = {
	kind: CellKind
	editorListCount: number
	isPartner: boolean
	// Pure annotation: the viewer has tagged the owner as their mother/father
	// (or both, in pathological cases). Per-direction, mirroring the
	// `userRelationLabels` schema; populated only on user-on-user cells.
	parentLabels: Array<RelationLabel>
}

export type ClassifyCellArgs = {
	viewerId: string
	ownerId: string
	guardianPairs: Set<string>
	relationships: Map<string, { accessLevel: AccessLevel; canEdit: boolean }>
	listEditorCounts: Map<string, number>
	partnerOf: Map<string, string | null>
	// Labels keyed by `${viewerId}|${ownerId}` (the userId in
	// userRelationLabels is the labeler, targetUserId is the target).
	relationLabelsByUserPair: Map<string, Array<RelationLabel>>
}

export const guardianKey = (parentId: string, childId: string) => `${parentId}|${childId}`
export const ownerViewerKey = (ownerId: string, viewerId: string) => `${ownerId}|${viewerId}`

export function classifyCell(args: ClassifyCellArgs): Cell {
	const { viewerId, ownerId, guardianPairs, relationships, listEditorCounts, partnerOf, relationLabelsByUserPair } = args
	const isPartner = (partnerOf.get(ownerId) ?? null) === viewerId
	const parentLabels = relationLabelsByUserPair.get(ownerViewerKey(viewerId, ownerId)) ?? []

	if (viewerId === ownerId) {
		// Self-labels are nonsensical; ignore them defensively.
		return { kind: 'self', editorListCount: 0, isPartner: false, parentLabels: [] }
	}

	if (guardianPairs.has(guardianKey(viewerId, ownerId))) {
		return { kind: 'guardian', editorListCount: 0, isPartner, parentLabels }
	}

	const rel = relationships.get(ownerViewerKey(ownerId, viewerId))
	const editorListCount = listEditorCounts.get(ownerViewerKey(ownerId, viewerId)) ?? 0

	if (rel?.accessLevel === 'none') {
		return { kind: 'denied', editorListCount, isPartner, parentLabels }
	}
	if (rel?.accessLevel === 'restricted') {
		// Restricted suppresses all edit grants by design.
		return { kind: 'restricted', editorListCount, isPartner, parentLabels }
	}
	if (rel?.canEdit === true) {
		return { kind: 'editor', editorListCount, isPartner, parentLabels }
	}
	if (editorListCount > 0) {
		return { kind: 'editor', editorListCount, isPartner, parentLabels }
	}
	return { kind: 'view', editorListCount, isPartner, parentLabels }
}

export type PermissionsMatrixUser = {
	id: string
	email: string
	name: string | null
	role: string
	image: string | null
	partnerId: string | null
	isGuardian: boolean
}

export type PermissionsMatrixDependent = {
	id: string
	name: string
	image: string | null
	guardianIds: Array<string>
}

export type PermissionsMatrixRelationLabel = {
	userId: string
	label: RelationLabel
	targetUserId: string | null
	targetDependentId: string | null
}

export type PermissionsMatrixData = {
	users: Array<PermissionsMatrixUser>
	// Optional for backwards-compat with mocks/fixtures written before
	// dependents existed; the live query always populates it.
	dependents?: Array<PermissionsMatrixDependent>
	guardianships: Array<{ parentUserId: string; childUserId: string }>
	relationships: Array<{ ownerUserId: string; viewerUserId: string; accessLevel: AccessLevel; canEdit: boolean }>
	listEditorCounts: Array<{ ownerId: string; userId: string; count: number }>
	// Optional for backwards-compat with mocks/fixtures written before relation
	// labels were surfaced in the matrix; the live query always populates it.
	relationLabels?: Array<PermissionsMatrixRelationLabel>
}

export function buildIndices(data: PermissionsMatrixData) {
	const guardianPairs = new Set(data.guardianships.map(g => guardianKey(g.parentUserId, g.childUserId)))
	const relationships = new Map<string, { accessLevel: AccessLevel; canEdit: boolean }>()
	for (const r of data.relationships) {
		relationships.set(ownerViewerKey(r.ownerUserId, r.viewerUserId), { accessLevel: r.accessLevel, canEdit: r.canEdit })
	}
	const listEditorCounts = new Map<string, number>()
	for (const e of data.listEditorCounts) {
		listEditorCounts.set(ownerViewerKey(e.ownerId, e.userId), e.count)
	}
	const partnerOf = new Map<string, string | null>()
	for (const u of data.users) partnerOf.set(u.id, u.partnerId)
	// Labels are stored as "userId labels target as their mother/father".
	// In matrix terms, the labeler is the VIEWER and the target is the
	// owner (or dependent column). We key by viewer|target so cell lookup
	// reads naturally. Same label twice is deduped; both labels on one
	// pair (mother + father, pathological) both pass through.
	const relationLabelsByUserPair = new Map<string, Array<RelationLabel>>()
	const relationLabelsByDependentPair = new Map<string, Array<RelationLabel>>()
	for (const row of data.relationLabels ?? []) {
		if (row.targetUserId) {
			const key = ownerViewerKey(row.userId, row.targetUserId)
			const bucket = relationLabelsByUserPair.get(key) ?? []
			if (!bucket.includes(row.label)) bucket.push(row.label)
			relationLabelsByUserPair.set(key, bucket)
		} else if (row.targetDependentId) {
			const key = ownerViewerKey(row.userId, row.targetDependentId)
			const bucket = relationLabelsByDependentPair.get(key) ?? []
			if (!bucket.includes(row.label)) bucket.push(row.label)
			relationLabelsByDependentPair.set(key, bucket)
		}
	}
	return { guardianPairs, relationships, listEditorCounts, partnerOf, relationLabelsByUserPair, relationLabelsByDependentPair }
}

// Classify a cell where the OWNER is a dependent. The viewer is always a
// user. Resolution order:
//   guardian > explicit deny (from any guardian) > restricted > view default
// Edit grants from `userRelationships.canEdit` and per-list editor rows
// don't apply to dependents in v1: the only edit access on a dependent's
// list is via `dependentGuardianships`. Partnership annotation is dropped
// (a dependent has no partner).
export type ClassifyDependentCellArgs = {
	viewerId: string
	dependentId: string
	guardianIds: Array<string>
	relationships: Map<string, { accessLevel: AccessLevel; canEdit: boolean }>
	relationLabelsByDependentPair: Map<string, Array<RelationLabel>>
}

export function classifyDependentCell(args: ClassifyDependentCellArgs): Cell {
	const { viewerId, dependentId, guardianIds, relationships, relationLabelsByDependentPair } = args
	const parentLabels = relationLabelsByDependentPair.get(ownerViewerKey(viewerId, dependentId)) ?? []
	if (guardianIds.includes(viewerId)) {
		return { kind: 'guardian', editorListCount: 0, isPartner: false, parentLabels }
	}
	let mostPermissive: AccessLevel | null = null
	for (const guardianId of guardianIds) {
		const rel = relationships.get(ownerViewerKey(guardianId, viewerId))
		if (!rel) continue
		if (rel.accessLevel === 'none') {
			return { kind: 'denied', editorListCount: 0, isPartner: false, parentLabels }
		}
		if (rel.accessLevel === 'view') mostPermissive = 'view'
		else if (mostPermissive !== 'view') mostPermissive = 'restricted'
	}
	if (mostPermissive === 'restricted') {
		return { kind: 'restricted', editorListCount: 0, isPartner: false, parentLabels }
	}
	return { kind: 'view', editorListCount: 0, isPartner: false, parentLabels }
}
