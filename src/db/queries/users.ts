import { asc } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'
import { guardianships } from '@/db/schema/permissions'

export const getAllUsersQuery = async () => {
	const [usersData, guardianRows] = await Promise.all([
		db.query.users.findMany({
			orderBy: [asc(users.name), asc(users.email)],
		}),
		db.selectDistinct({ parentUserId: guardianships.parentUserId }).from(guardianships),
	])

	const guardianIds = new Set(guardianRows.map(r => r.parentUserId))

	return usersData.map(u => ({
		id: u.id,
		email: u.email,
		name: u.name,
		role: u.role,
		image: u.image,
		isGuardian: guardianIds.has(u.id),
		createdAt: u.createdAt instanceof Date ? u.createdAt.toISOString() : u.createdAt,
		updatedAt: u.updatedAt instanceof Date ? u.updatedAt.toISOString() : u.updatedAt,
	}))
}

export const getUserDetailsQuery = async (userId: string) => {
	// await new Promise(resolve => setTimeout(resolve, 10000))
	const userData = await db.query.users.findFirst({
		where: (u, { eq }) => eq(u.id, userId),
	})

	return userData
}
