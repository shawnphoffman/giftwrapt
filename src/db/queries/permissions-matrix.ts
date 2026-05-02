import { asc, sql } from 'drizzle-orm'

import { db } from '@/db'
import { guardianships, listEditors, userRelationships, users } from '@/db/schema'
import type { PermissionsMatrixData } from '@/lib/permissions-matrix'

export const getPermissionsMatrixQuery = async (): Promise<PermissionsMatrixData> => {
	const [usersData, guardianshipRows, relationshipRows, listEditorRows] = await Promise.all([
		db.query.users.findMany({
			orderBy: [asc(users.name), asc(users.email)],
			columns: { id: true, email: true, name: true, role: true, image: true, partnerId: true },
		}),
		db.select({ parentUserId: guardianships.parentUserId, childUserId: guardianships.childUserId }).from(guardianships),
		db
			.select({
				ownerUserId: userRelationships.ownerUserId,
				viewerUserId: userRelationships.viewerUserId,
				accessLevel: userRelationships.accessLevel,
				canEdit: userRelationships.canEdit,
			})
			.from(userRelationships),
		db
			.select({
				ownerId: listEditors.ownerId,
				userId: listEditors.userId,
				count: sql<number>`count(*)::int`,
			})
			.from(listEditors)
			.groupBy(listEditors.ownerId, listEditors.userId),
	])

	const guardianIds = new Set(guardianshipRows.map(r => r.parentUserId))

	return {
		users: usersData.map(u => ({
			id: u.id,
			email: u.email,
			name: u.name,
			role: u.role,
			image: u.image,
			partnerId: u.partnerId,
			isGuardian: guardianIds.has(u.id),
		})),
		guardianships: guardianshipRows,
		relationships: relationshipRows,
		listEditorCounts: listEditorRows,
	}
}
