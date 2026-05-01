import { nanoid } from 'nanoid'

import type { SchemaDatabase } from '@/db'
import type { BirthMonth, GiftedItem, Item, ItemComment, ItemScrape, List, ListAddon, ListEditor, Role, User } from '@/db/schema'
import {
	account,
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
			giftIdeasTargetUserId: overrides.giftIdeasTargetUserId ?? null,
		})
		.returning()
	return row
}

export async function makeItem(tx: Tx, overrides: Partial<typeof items.$inferInsert> & { listId: number }): Promise<Item> {
	const [row] = await tx
		.insert(items)
		.values({
			listId: overrides.listId,
			groupId: overrides.groupId ?? null,
			title: overrides.title ?? `Item ${nextId()}`,
			status: overrides.status ?? 'incomplete',
			availability: overrides.availability ?? 'available',
			isArchived: overrides.isArchived ?? false,
			priority: overrides.priority ?? 'normal',
			quantity: overrides.quantity ?? 1,
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
		})
		.returning()
	return row
}

export async function makeGuardianship(tx: Tx, args: { parentUserId: string; childUserId: string }): Promise<void> {
	await tx.insert(guardianships).values(args)
}

export async function makeUserRelationship(
	tx: Tx,
	args: { ownerUserId: string; viewerUserId: string; canView?: boolean; canEdit?: boolean }
): Promise<void> {
	await tx.insert(userRelationships).values({
		ownerUserId: args.ownerUserId,
		viewerUserId: args.viewerUserId,
		canView: args.canView ?? true,
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
