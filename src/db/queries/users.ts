import { asc, eq } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'
import { guardianships } from '@/db/schema/permissions'

export const getAllUsersQuery = async () => {
	const [usersData, guardianshipRows] = await Promise.all([
		db.query.users.findMany({
			orderBy: [asc(users.name), asc(users.email)],
			with: {
				partner: {
					columns: { id: true, name: true, email: true, image: true },
				},
			},
		}),
		db
			.select({
				parentUserId: guardianships.parentUserId,
				childUserId: guardianships.childUserId,
				parentName: users.name,
				parentEmail: users.email,
				parentImage: users.image,
			})
			.from(guardianships)
			.innerJoin(users, eq(users.id, guardianships.parentUserId)),
	])

	const guardianIds = new Set(guardianshipRows.map(r => r.parentUserId))
	const guardiansByChild = new Map<string, Array<{ id: string; name: string | null; email: string; image: string | null }>>()
	for (const row of guardianshipRows) {
		const list = guardiansByChild.get(row.childUserId) ?? []
		list.push({ id: row.parentUserId, name: row.parentName, email: row.parentEmail, image: row.parentImage })
		guardiansByChild.set(row.childUserId, list)
	}

	return usersData.map(u => ({
		id: u.id,
		email: u.email,
		name: u.name,
		role: u.role,
		image: u.image,
		isGuardian: guardianIds.has(u.id),
		guardians: guardiansByChild.get(u.id) ?? [],
		partnerId: u.partnerId,
		partner: u.partner ? { id: u.partner.id, name: u.partner.name, email: u.partner.email, image: u.partner.image } : null,
		birthMonth: u.birthMonth,
		birthDay: u.birthDay,
		birthYear: u.birthYear,
		twoFactorEnabled: u.twoFactorEnabled,
		emailVerified: u.emailVerified,
		banned: u.banned,
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
