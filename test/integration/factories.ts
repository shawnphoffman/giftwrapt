import { nanoid } from 'nanoid'

import type { SchemaDatabase } from '@/db'
import type { BirthMonth, Dependent, GiftedItem, Item, ItemComment, ItemScrape, List, ListAddon, ListEditor, Role, User } from '@/db/schema'
import {
	account,
	dependentGuardianships,
	dependents,
	giftedItems,
	guardianships,
	itemComments,
	items,
	itemScrapes,
	listAddons,
	listEditors,
	lists,
	session,
	userRelationships,
	users,
} from '@/db/schema'

let counter = 0
const nextId = () => `${Date.now()}-${++counter}-${nanoid(6)}`

type Tx = SchemaDatabase

export async function makeUser(
	tx: Tx,
	overrides: Partial<{
		id: string
		email: string
		name: string | null
		role: Role
		image: string | null
		partnerId: string | null
		birthMonth: BirthMonth | null
		birthDay: number | null
		birthYear: number | null
		banned: boolean
	}> = {}
): Promise<User> {
	const id = overrides.id ?? `user_${nextId()}`
	const email = overrides.email ?? `${id}@test.local`
	// Explicit null on `name` is meaningful (the column is nullable and
	// some flows test the "no display name" path), so distinguish
	// "override unset" from "override is null".
	const name = 'name' in overrides ? overrides.name : `Test ${id}`
	const [row] = await tx
		.insert(users)
		.values({
			id,
			email,
			name,
			role: overrides.role ?? 'user',
			image: overrides.image ?? null,
			partnerId: overrides.partnerId ?? null,
			birthMonth: overrides.birthMonth ?? null,
			birthDay: overrides.birthDay ?? null,
			birthYear: overrides.birthYear ?? null,
			banned: overrides.banned ?? false,
		})
		.returning()
	return row
}

export async function makeList(tx: Tx, overrides: Partial<typeof lists.$inferInsert> & { ownerId: string }): Promise<List> {
	const [row] = await tx
		.insert(lists)
		.values({
			name: overrides.name ?? `List ${nextId()}`,
			type: overrides.type ?? 'wishlist',
			isActive: overrides.isActive ?? true,
			isPrivate: overrides.isPrivate ?? false,
			isPrimary: overrides.isPrimary ?? false,
			description: overrides.description ?? null,
			ownerId: overrides.ownerId,
			subjectDependentId: overrides.subjectDependentId ?? null,
			giftIdeasTargetUserId: overrides.giftIdeasTargetUserId ?? null,
			giftIdeasTargetDependentId: overrides.giftIdeasTargetDependentId ?? null,
			holidayCountry: overrides.holidayCountry ?? null,
			holidayKey: overrides.holidayKey ?? null,
			customHolidayId: overrides.customHolidayId ?? null,
			lastHolidayArchiveAt: overrides.lastHolidayArchiveAt ?? null,
			// Honor explicit createdAt/updatedAt so tests can fabricate old
			// rows (e.g. the list-hygiene duplicate-clusters predicate keys
			// off `createdAt` + `updatedAt`). Drizzle's $onUpdate trigger
			// would overwrite an explicit updatedAt on a future update; the
			// tests that care reload the row directly without going through
			// an update path.
			...(overrides.createdAt !== undefined ? { createdAt: overrides.createdAt } : {}),
			...(overrides.updatedAt !== undefined ? { updatedAt: overrides.updatedAt } : {}),
		})
		.returning()
	return row
}

export async function makeItem(tx: Tx, overrides: Partial<typeof items.$inferInsert> & { listId: number }): Promise<Item> {
	const [row] = await tx
		.insert(items)
		.values({
			title: `Item ${nextId()}`,
			status: 'incomplete',
			availability: 'available',
			isArchived: false,
			priority: 'normal',
			quantity: 1,
			...overrides,
		})
		.returning()
	return row
}

export async function makeGiftedItem(
	tx: Tx,
	overrides: Partial<typeof giftedItems.$inferInsert> & { itemId: number; gifterId: string }
): Promise<GiftedItem> {
	const [row] = await tx
		.insert(giftedItems)
		.values({
			itemId: overrides.itemId,
			gifterId: overrides.gifterId,
			additionalGifterIds: overrides.additionalGifterIds ?? null,
			quantity: overrides.quantity ?? 1,
			totalCost: overrides.totalCost ?? null,
			notes: overrides.notes ?? null,
			...(overrides.createdAt !== undefined ? { createdAt: overrides.createdAt } : {}),
			...(overrides.updatedAt !== undefined ? { updatedAt: overrides.updatedAt } : {}),
		})
		.returning()
	return row
}

export async function makeGuardianship(tx: Tx, args: { parentUserId: string; childUserId: string }): Promise<void> {
	await tx.insert(guardianships).values(args)
}

export async function makeDependent(
	tx: Tx,
	overrides: Partial<{
		id: string
		name: string
		image: string | null
		birthMonth: BirthMonth | null
		birthDay: number | null
		birthYear: number | null
		isArchived: boolean
		createdByUserId: string
	}> & { createdByUserId: string }
): Promise<Dependent> {
	const id = overrides.id ?? `dep_${nextId()}`
	const [row] = await tx
		.insert(dependents)
		.values({
			id,
			name: overrides.name ?? `Dependent ${id}`,
			image: overrides.image ?? null,
			birthMonth: overrides.birthMonth ?? null,
			birthDay: overrides.birthDay ?? null,
			birthYear: overrides.birthYear ?? null,
			isArchived: overrides.isArchived ?? false,
			createdByUserId: overrides.createdByUserId,
		})
		.returning()
	return row
}

export async function makeDependentGuardianship(tx: Tx, args: { guardianUserId: string; dependentId: string }): Promise<void> {
	await tx.insert(dependentGuardianships).values(args)
}

export async function makeUserRelationship(
	tx: Tx,
	args: {
		ownerUserId: string
		viewerUserId: string
		// Either field accepted; if both omitted defaults to ('view', false).
		// `canView` is the pre-0016 legacy shape, kept so older tests don't
		// have to change shape just for the rename.
		canView?: boolean
		accessLevel?: 'none' | 'restricted' | 'view'
		canEdit?: boolean
	}
): Promise<void> {
	const accessLevel: 'none' | 'restricted' | 'view' = args.accessLevel ?? (args.canView === false ? 'none' : 'view')
	await tx.insert(userRelationships).values({
		ownerUserId: args.ownerUserId,
		viewerUserId: args.viewerUserId,
		accessLevel,
		canEdit: args.canEdit ?? false,
	})
}

export async function makeListEditor(tx: Tx, args: { listId: number; userId: string; ownerId: string }): Promise<ListEditor> {
	const [row] = await tx.insert(listEditors).values(args).returning()
	return row
}

export async function makeListAddon(
	tx: Tx,
	overrides: Partial<typeof listAddons.$inferInsert> & { listId: number; userId: string }
): Promise<ListAddon> {
	const [row] = await tx
		.insert(listAddons)
		.values({
			listId: overrides.listId,
			userId: overrides.userId,
			description: overrides.description ?? `Addon ${nextId()}`,
			totalCost: overrides.totalCost ?? null,
			notes: overrides.notes ?? null,
			isArchived: overrides.isArchived ?? false,
		})
		.returning()
	return row
}

export async function makeItemComment(tx: Tx, args: { itemId: number; userId: string; comment?: string }): Promise<ItemComment> {
	const [row] = await tx
		.insert(itemComments)
		.values({
			itemId: args.itemId,
			userId: args.userId,
			comment: args.comment ?? `Comment ${nextId()}`,
		})
		.returning()
	return row
}

export async function makeItemScrape(
	tx: Tx,
	overrides: Partial<typeof itemScrapes.$inferInsert> & { url: string; scraperId: string }
): Promise<ItemScrape> {
	const [row] = await tx
		.insert(itemScrapes)
		.values({
			itemId: overrides.itemId ?? null,
			userId: overrides.userId ?? null,
			url: overrides.url,
			scraperId: overrides.scraperId,
			ok: overrides.ok ?? true,
		})
		.returning()
	return row
}

export async function makeSession(tx: Tx, args: { userId: string }): Promise<void> {
	const id = `sess_${nextId()}`
	await tx.insert(session).values({
		id,
		userId: args.userId,
		token: id,
		expiresAt: new Date(Date.now() + 60 * 60 * 1000),
	})
}

export async function makeAccount(tx: Tx, args: { userId: string }): Promise<void> {
	const id = `acct_${nextId()}`
	await tx.insert(account).values({
		id,
		userId: args.userId,
		accountId: id,
		providerId: 'credential',
	})
}
