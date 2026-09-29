// Server-side half of comment @mentions: who may be mentioned on a list,
// and refreshing token names to users' current names on read. The pure
// token grammar lives in `comment-mentions.ts`.
//
// "Mentionable" is exactly "can read this item's comments", i.e.
// `canViewListAsAnyone`, minus banned users. The same predicate feeds the
// typeahead and the write-time validation, so a mention can never email
// comment content to someone who couldn't open the list.

import { and, eq, inArray } from 'drizzle-orm'

import type { SchemaDatabase } from '@/db'
import { users } from '@/db/schema'
import { extractMentionUserIds, rewriteMentions } from '@/lib/comment-mentions'
import { canViewListAsAnyone } from '@/lib/permissions'

export type MentionableUser = {
	id: string
	name: string | null
	email: string
	image: string | null
}

type ListForMentions = Parameters<typeof canViewListAsAnyone>[1]

async function filterByListVisibility(dbx: SchemaDatabase, list: ListForMentions, candidates: Array<MentionableUser>) {
	const checks = await Promise.all(candidates.map(u => canViewListAsAnyone(u.id, list, dbx)))
	return candidates.filter((_, i) => checks[i].ok)
}

export async function listMentionableUsers(dbx: SchemaDatabase, list: ListForMentions): Promise<Array<MentionableUser>> {
	const candidates = await dbx.query.users.findMany({
		where: eq(users.banned, false),
		columns: { id: true, name: true, email: true, image: true },
	})
	return filterByListVisibility(dbx, list, candidates)
}

export async function resolveMentionableUsers(
	dbx: SchemaDatabase,
	list: ListForMentions,
	userIds: ReadonlyArray<string>
): Promise<Map<string, MentionableUser>> {
	if (userIds.length === 0) return new Map()
	const candidates = await dbx.query.users.findMany({
		where: and(inArray(users.id, [...userIds]), eq(users.banned, false)),
		columns: { id: true, name: true, email: true, image: true },
	})
	const allowed = await filterByListVisibility(dbx, list, candidates)
	return new Map(allowed.map(u => [u.id, u]))
}

export function mentionDisplayName(u: { name: string | null; email: string }): string {
	return u.name || u.email
}

// Rewrites mention tokens in each row's `comment` to the mentioned user's
// current name. Tokens for users that no longer exist keep their snapshot.
export async function refreshMentionNames<T extends { comment: string }>(dbx: SchemaDatabase, rows: Array<T>): Promise<Array<T>> {
	const ids = [...new Set(rows.flatMap(r => extractMentionUserIds(r.comment)))]
	if (ids.length === 0) return rows
	const found = await dbx.query.users.findMany({
		where: inArray(users.id, ids),
		columns: { id: true, name: true, email: true },
	})
	const names = new Map(found.map(u => [u.id, mentionDisplayName(u)]))
	return rows.map(r => ({ ...r, comment: rewriteMentions(r.comment, (id, snapshot) => names.get(id) ?? snapshot) }))
}
