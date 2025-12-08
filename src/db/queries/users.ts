import { asc } from 'drizzle-orm'

import { db } from '@/db'
import { users } from '@/db/schema'

export const getAllUsersQuery = async () => {
	// Fetch all users
	const usersData = await db.query.users.findMany({
		orderBy: [asc(users.name), asc(users.email)],
	})

	// Convert dates to ISO strings for JSON serialization
	return usersData.map(u => ({
		id: u.id,
		email: u.email,
		name: u.name,
		role: u.role,
		image: u.image,

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
