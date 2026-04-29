// Pure helpers for the admin permissions matrix.
//
// `classifyCell` decides what a single matrix cell should display: the
// strongest grant the viewer has on the owner's lists, plus annotations for
// per-list editor grants and the partner relationship. The resolution order
// mirrors `canEditList` / `canViewList` in `@/lib/permissions`:
//   self > guardian > explicit deny > user-level edit > list-level edit > default view
// Partner is an annotation, not a permission, because partnership alone
// doesn't grant view/edit beyond the public default.

export type CellKind = 'self' | 'guardian' | 'editor' | 'view' | 'denied'

export type Cell = {
	kind: CellKind
	editorListCount: number
	isPartner: boolean
}

export type ClassifyCellArgs = {
	viewerId: string
	ownerId: string
	guardianPairs: Set<string>
	relationships: Map<string, { canView: boolean; canEdit: boolean }>
	listEditorCounts: Map<string, number>
	partnerOf: Map<string, string | null>
}

export const guardianKey = (parentId: string, childId: string) => `${parentId}|${childId}`
export const ownerViewerKey = (ownerId: string, viewerId: string) => `${ownerId}|${viewerId}`

export function classifyCell(args: ClassifyCellArgs): Cell {
	const { viewerId, ownerId, guardianPairs, relationships, listEditorCounts, partnerOf } = args
	const isPartner = (partnerOf.get(ownerId) ?? null) === viewerId

	if (viewerId === ownerId) {
		return { kind: 'self', editorListCount: 0, isPartner: false }
	}

	if (guardianPairs.has(guardianKey(viewerId, ownerId))) {
		return { kind: 'guardian', editorListCount: 0, isPartner }
	}

	const rel = relationships.get(ownerViewerKey(ownerId, viewerId))
	const editorListCount = listEditorCounts.get(ownerViewerKey(ownerId, viewerId)) ?? 0

	if (rel && rel.canView === false) {
		return { kind: 'denied', editorListCount, isPartner }
	}
	if (rel && rel.canEdit === true) {
		return { kind: 'editor', editorListCount, isPartner }
	}
	if (editorListCount > 0) {
		return { kind: 'editor', editorListCount, isPartner }
	}
	return { kind: 'view', editorListCount, isPartner }
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

export type PermissionsMatrixData = {
	users: Array<PermissionsMatrixUser>
	guardianships: Array<{ parentUserId: string; childUserId: string }>
	relationships: Array<{ ownerUserId: string; viewerUserId: string; canView: boolean; canEdit: boolean }>
	listEditorCounts: Array<{ ownerId: string; userId: string; count: number }>
}

export function buildIndices(data: PermissionsMatrixData) {
	const guardianPairs = new Set(data.guardianships.map(g => guardianKey(g.parentUserId, g.childUserId)))
	const relationships = new Map<string, { canView: boolean; canEdit: boolean }>()
	for (const r of data.relationships) {
		relationships.set(ownerViewerKey(r.ownerUserId, r.viewerUserId), { canView: r.canView, canEdit: r.canEdit })
	}
	const listEditorCounts = new Map<string, number>()
	for (const e of data.listEditorCounts) {
		listEditorCounts.set(ownerViewerKey(e.ownerId, e.userId), e.count)
	}
	const partnerOf = new Map<string, string | null>()
	for (const u of data.users) partnerOf.set(u.id, u.partnerId)
	return { guardianPairs, relationships, listEditorCounts, partnerOf }
}
