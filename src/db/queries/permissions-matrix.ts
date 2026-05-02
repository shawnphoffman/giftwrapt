import { asc, eq, sql } from 'drizzle-orm'

import { db } from '@/db'
import { dependentGuardianships, dependents, guardianships, listEditors, userRelationships, users } from '@/db/schema'
import type { PermissionsMatrixData } from '@/lib/permissions-matrix'

export const getPermissionsMatrixQuery = async (): Promise<PermissionsMatrixData> => {
	const [usersData, dependentRows, dependentGuardianshipRows, guardianshipRows, relationshipRows, listEditorRows] = await Promise.all([
		db.query.users.findMany({
			orderBy: [asc(users.name), asc(users.email)],
			columns: { id: true, email: true, name: true, role: true, image: true, partnerId: true },
		}),
		db
			.select({ id: dependents.id, name: dependents.name, image: dependents.image })
			.from(dependents)
			.where(eq(dependents.isArchived, false))
			.orderBy(asc(dependents.name)),
		db
			.select({ guardianUserId: dependentGuardianships.guardianUserId, dependentId: dependentGuardianships.dependentId })
			.from(dependentGuardianships),
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

	const guardiansByDependentId = new Map<string, Array<string>>()
	for (const row of dependentGuardianshipRows) {
		const arr = guardiansByDependentId.get(row.dependentId) ?? []
		arr.push(row.guardianUserId)
		guardiansByDependentId.set(row.dependentId, arr)
	}

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
		dependents: dependentRows.map(d => ({
			id: d.id,
			name: d.name,
			image: d.image,
			guardianIds: guardiansByDependentId.get(d.id) ?? [],
		})),
		guardianships: guardianshipRows,
		relationships: relationshipRows,
		listEditorCounts: listEditorRows,
	}
}
