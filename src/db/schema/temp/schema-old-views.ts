// views.ts
import { sql, desc } from 'drizzle-orm'
import { pgView } from 'drizzle-orm/pg-core'
import { lists, listItems, users, listEditors, giftedItems, authUsers, userViewers } from './schema-old'

// SAMPLE FROM DOCS
/**
 // regular view
	const newYorkers = pgView('new_yorkers')
		.with({
			checkOption: 'cascaded',
			securityBarrier: true,
			securityInvoker: true,
		})
		.as((qb) => {
			const sq = qb
				.$with('sq')
				.as(
					qb.select({ userId: users.id, cityId: cities.id })
						.from(users)
						.leftJoin(cities, eq(cities.id, users.homeCity))
						.where(sql`${users.age1} > 18`),
				);
			return qb.with(sq).select().from(sq).where(sql`${users.homeCity} = 1`);
		});
 */

/* ────────────────────────────────────────────────────────────────
   view_list_gift_ideas
────────────────────────────────────────────────────────────────── */

export const viewListGiftIdeas = pgView('view_list_gift_ideas').as(qb =>
	qb
		.select({
			id: lists.id,
			createdAt: lists.createdAt,
			name: lists.name,
			type: lists.type,
			active: lists.active,
			userId: lists.userId,
			recipientUserId: lists.recipientUserId,
			private: lists.private,
			primary: lists.primary,
			count: sql<number>`count(${listItems.id})`,
			ownerDisplayName: users.displayName,
			ownerId: users.userId,
			isListOwner: sql<boolean>`(${lists.userId} = auth.uid())`,
			isListRecipient: sql<boolean>`(${lists.recipientUserId} = auth.uid())`,
		})
		.from(lists)
		.leftJoin(listItems, sql`${listItems.listId} = ${lists.id} AND ${listItems.archived} = false`)
		.innerJoin(users, sql`${lists.recipientUserId} = ${users.userId}`)
		.where(
			sql`
      ${lists.type} = 'giftideas'::text
      AND ${lists.id} IN (
        SELECT l2.id
        FROM ${lists} l2
        WHERE l2.user_id = auth.uid()
        UNION
        SELECT le.list_id AS id
        FROM ${listEditors} le
        WHERE le.user_id = auth.uid()
      )
    `
		)
		.groupBy(lists.id, users.displayName, users.id)
		.orderBy(lists.recipientUserId, lists.id)
)

export type ViewListGiftIdeas = typeof viewListGiftIdeas.$inferSelect

/* ────────────────────────────────────────────────────────────────
   view_me
────────────────────────────────────────────────────────────────── */

export const viewMe = pgView('view_me').as(qb =>
	qb
		.select({
			id: users.id,
			createdAt: users.createdAt,
			userId: users.userId,
			displayName: users.displayName,
			birthMonth: users.birthMonth,
			birthDay: users.birthDay,
			isAdmin: users.isAdmin,
			partnerUserId: users.partnerUserId,
			image: users.image,
		})
		.from(users)
		.where(sql`${users.userId} = auth.uid()`)
)

export type ViewMe = typeof viewMe.$inferSelect

/* ────────────────────────────────────────────────────────────────
   view_my_lists
────────────────────────────────────────────────────────────────── */

export const viewMyLists = pgView('view_my_lists').as(qb =>
	qb
		.select({
			id: lists.id,
			createdAt: lists.createdAt,
			name: lists.name,
			type: lists.type,
			active: lists.active,
			userId: lists.userId,
			recipientUserId: lists.recipientUserId,
			private: lists.private,
			primary: lists.primary,
			description: lists.description,
			count: sql<number>`count(${listItems.id})`,
		})
		.from(lists)
		.leftJoin(listItems, sql`${listItems.listId} = ${lists.id} AND ${listItems.archived} = false`)
		.where(
			sql`
      ${lists.id} IN (
        SELECT l2.id
        FROM ${lists} l2
        WHERE l2.user_id = auth.uid()
          AND l2.recipient_user_id = auth.uid()
      )
    `
		)
		.groupBy(lists.id)
		.orderBy(lists.recipientUserId, lists.id)
)

export type ViewMyLists = typeof viewMyLists.$inferSelect

/* ────────────────────────────────────────────────────────────────
   view_my_lists2
────────────────────────────────────────────────────────────────── */

export const viewMyLists2 = pgView('view_my_lists2').as(qb =>
	qb
		.select({
			id: lists.id,
			createdAt: lists.createdAt,
			name: lists.name,
			type: lists.type,
			active: lists.active,
			userId: lists.userId,
			recipientUserId: lists.recipientUserId,
			private: lists.private,
			primary: lists.primary,
			description: lists.description,
			count: sql<number>`count(${listItems.id})`,
		})
		.from(lists)
		.leftJoin(listItems, sql`${listItems.listId} = ${lists.id} AND ${listItems.archived} = false`)
		.where(
			sql`
      ${lists.id} IN (
        SELECT l2.id
        FROM ${lists} l2
        WHERE l2.user_id = auth.uid()
        UNION
        SELECT le.list_id AS id
        FROM ${listEditors} le
        WHERE le.user_id = auth.uid()
      )
    `
		)
		.groupBy(lists.id)
		.orderBy(lists.recipientUserId, lists.id)
)

export type ViewMyLists2 = typeof viewMyLists2.$inferSelect

/* ────────────────────────────────────────────────────────────────
   view_my_purchases
────────────────────────────────────────────────────────────────── */

export const viewMyPurchases = pgView('view_my_purchases').as(qb =>
	qb
		.select({
			gifterId: giftedItems.gifterId,
			quantity: giftedItems.quantity,
			id: listItems.id,
			createdAt: listItems.createdAt,
			listId: listItems.listId,
			title: listItems.title,
			url: listItems.url,
			scrape: listItems.scrape,
			userId: listItems.userId,
			priority: listItems.priority,
			notes: listItems.notes,
			imageUrl: listItems.imageUrl,
			status: listItems.status,
			archived: listItems.archived,
			price: listItems.price,
			recipientUserId: users.userId,
			recipientDisplayName: users.displayName,
			recipientId: users.id,
			giftCreatedAt: giftedItems.createdAt,
		})
		.from(giftedItems)
		.innerJoin(listItems, sql`${giftedItems.itemId} = ${listItems.id}`)
		.innerJoin(lists, sql`${listItems.listId} = ${lists.id}`)
		.innerJoin(users, sql`${lists.recipientUserId} = ${users.userId}`)
		.where(
			sql`
      (
        ${giftedItems.gifterId} = auth.uid()
        OR (
          ${giftedItems.gifterId} IN (
            SELECT ${users.partnerUserId}
            FROM ${users}
            WHERE ${users.userId} = auth.uid()
          )
        )
      )
      AND ${lists.recipientUserId} <> auth.uid()
    `
		)
		.orderBy(desc(giftedItems.createdAt))
)

export type ViewMyPurchases = typeof viewMyPurchases.$inferSelect

/* ────────────────────────────────────────────────────────────────
   view_shared_with_me
────────────────────────────────────────────────────────────────── */

export const viewSharedWithMe = pgView('view_shared_with_me').as(qb =>
	qb
		.select({
			id: lists.id,
			createdAt: lists.createdAt,
			name: lists.name,
			type: lists.type,
			active: lists.active,
			userId: lists.userId,
			recipientUserId: lists.recipientUserId,
			private: lists.private,
			primary: lists.primary,
			count: sql<number>`count(${listItems.id})`,
			sharerDisplayName: users.displayName,
			sharerId: users.id,
		})
		.from(lists)
		.leftJoin(listItems, sql`${listItems.listId} = ${lists.id} AND ${listItems.archived} = false`)
		.innerJoin(users, sql`${lists.recipientUserId} = ${users.userId}`)
		.where(
			sql`
      ${lists.id} IN (
        SELECT le.list_id AS id
        FROM ${listEditors} le
        WHERE le.user_id = auth.uid()
        UNION
        SELECT l2.id
        FROM ${lists} l2
        WHERE l2.user_id = auth.uid()
          AND l2.recipient_user_id <> auth.uid()
      )
    `
		)
		.groupBy(lists.id, users.displayName, users.id)
		.orderBy(lists.recipientUserId, lists.id)
)

export type ViewSharedWithMe = typeof viewSharedWithMe.$inferSelect

/* ────────────────────────────────────────────────────────────────
   view_shared_with_others
────────────────────────────────────────────────────────────────── */

export const viewSharedWithOthers = pgView('view_shared_with_others').as(qb =>
	qb
		.select({
			id: lists.id,
			createdAt: lists.createdAt,
			name: lists.name,
			type: lists.type,
			active: lists.active,
			userId: lists.userId,
			recipientUserId: lists.recipientUserId,
			private: lists.private,
			primary: lists.primary,
			description: lists.description,
			count: sql<number>`count(${listItems.id})`,
		})
		.from(listEditors)
		.leftJoin(lists, sql`${listEditors.listId} = ${lists.id}`)
		.leftJoin(listItems, sql`${listItems.listId} = ${lists.id} AND ${listItems.archived} = false`)
		.innerJoin(users, sql`${listEditors.userId} = ${users.userId}`)
		.where(
			sql`
        ${listEditors.listId} IN (
          SELECT l2.id
          FROM ${lists} l2
          WHERE l2.user_id = auth.uid()
        )
      `
		)
		.groupBy(lists.id)
		.orderBy(lists.id)
)

export type ViewSharedWithOthers = typeof viewSharedWithOthers.$inferSelect

/* ────────────────────────────────────────────────────────────────
   view_sorted_list_items
────────────────────────────────────────────────────────────────── */

export const viewSortedListItems = pgView('view_sorted_list_items').as(qb =>
	qb
		.select({
			id: listItems.id,
			createdAt: listItems.createdAt,
			listId: listItems.listId,
			title: listItems.title,
			url: listItems.url,
			scrape: listItems.scrape,
			userId: listItems.userId,
			priority: listItems.priority,
			notes: listItems.notes,
			imageUrl: listItems.imageUrl,
			status: listItems.status,
			archived: listItems.archived,
			price: listItems.price,
			quantity: listItems.quantity,
			tags: listItems.tags,
			updatedAt: listItems.updatedAt,
		})
		.from(listItems)
		.orderBy(desc(listItems.priority), listItems.title)
)

export type ViewSortedListItems = typeof viewSortedListItems.$inferSelect

/* ────────────────────────────────────────────────────────────────
   view_sorted_lists
────────────────────────────────────────────────────────────────── */

export const viewSortedLists = pgView('view_sorted_lists').as(qb =>
	qb
		.select({
			id: lists.id,
			createdAt: lists.createdAt,
			name: lists.name,
			type: lists.type,
			active: lists.active,
			userId: lists.userId,
			recipientUserId: lists.recipientUserId,
			private: lists.private,
			primary: lists.primary,
			description: lists.description,
			count: sql<number>`
        count(
          CASE
            WHEN ${listItems.archived} = false THEN 1
            ELSE NULL::integer
          END
        )
      `,
		})
		.from(lists)
		.leftJoin(listItems, sql`${listItems.listId} = ${lists.id}`)
		.where(
			sql`
      ${lists.recipientUserId} <> auth.uid()
      AND ${lists.active} = true
      AND ${lists.private} = false
    `
		)
		.groupBy(lists.id)
		.orderBy(lists.id)
)

export type ViewSortedLists = typeof viewSortedLists.$inferSelect

/* ────────────────────────────────────────────────────────────────
   view_users
────────────────────────────────────────────────────────────────── */

export const viewUsers = pgView('view_users').as(qb =>
	qb
		.select({
			id: users.id,
			userId: users.userId,
			displayName: users.displayName,
			email: authUsers.email,
			birthDay: users.birthDay,
			birthMonth: users.birthMonth,
			image: users.image,
		})
		.from(users)
		.leftJoin(authUsers, sql`${users.userId} = ${authUsers.id}`)
		.leftJoin(userViewers, sql`${users.userId} = ${userViewers.ownerUserId}`).where(sql`
      ${userViewers.viewerUserId} = auth.uid()
      AND ${userViewers.canView} = true
    `)
)

export type ViewUsers = typeof viewUsers.$inferSelect
