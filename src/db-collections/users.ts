import { z } from 'zod'

// Schema matching the user table
const UserSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	role: z.string(),
	image: z.string().nullable(),
	isAdmin: z.boolean(),
	createdAt: z.string(),
	updatedAt: z.string(),
})

export type User = z.infer<typeof UserSchema>

// Note: usersCollection was removed as it's not currently used.
// Components use getAdminUsers server function directly via useQuery.
// If you need a collection in the future, you can recreate it using:
// queryFn: getAdminUsers
