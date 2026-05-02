import { z } from 'zod'

import { birthMonthEnumValues } from '@/db/schema/enums'

const PartnerSummarySchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	image: z.string().nullable(),
})

// Schema matching the user table
const UserSchema = z.object({
	id: z.string(),
	email: z.string(),
	name: z.string().nullable(),
	role: z.string(),
	image: z.string().nullable(),
	isGuardian: z.boolean().optional(),
	guardians: z.array(PartnerSummarySchema).optional(),
	partnerId: z.string().nullable().optional(),
	partner: PartnerSummarySchema.nullable().optional(),
	birthMonth: z.enum(birthMonthEnumValues).nullable().optional(),
	birthDay: z.number().nullable().optional(),
	birthYear: z.number().nullable().optional(),
	twoFactorEnabled: z.boolean().optional(),
	emailVerified: z.boolean().optional(),
	banned: z.boolean().optional(),
	createdAt: z.string(),
	updatedAt: z.string(),
})

export type User = z.infer<typeof UserSchema>

// Note: usersCollection was removed as it's not currently used.
// Components use getAdminUsers server function directly via useQuery.
// If you need a collection in the future, you can recreate it using:
// queryFn: getAdminUsers
