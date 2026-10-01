import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getGroupsForListImpl } from '@/api/_groups-impl'
import { getItemsForListEditImpl } from '@/api/_items-extra-impl'
import { getMyListsImpl, type MyListRow } from '@/api/_lists-impl'
import { groupTypeEnumValues, lists, listTypeEnumValues, priorityEnumValues } from '@/db/schema'
import { loadArchiveBannerInfo } from '@/lib/archive-schedule-loader'

import type { ToolContext } from '../context'
import { toolError, toolOk } from '../errors'
import { lines, plural } from '../format'
import { defineTool } from '../server'
import { itemLine, itemSchema, toItemShape } from '../shapes'

const listRoleSchema = z.enum(['owner', 'editor', 'guardian', 'dependent-guardian'])

const personRefSchema = z.object({ kind: z.enum(['user', 'dependent']), id: z.string(), name: z.string().nullable() })

export const myListSchema = z.object({
	id: z.number(),
	name: z.string(),
	type: z.enum(listTypeEnumValues),
	isPrimary: z.boolean(),
	isPrivate: z.boolean(),
	isActive: z.boolean().describe('false means archived'),
	description: z.string().nullable(),
	itemCount: z.number(),
	role: listRoleSchema.describe('owner: mine. editor: someone shared it. guardian: my child’s. dependent-guardian: a dependent I manage.'),
	forPerson: personRefSchema.nullable().describe('Whose gifts this list is for when it is not my own'),
	giftIdeasTarget: personRefSchema.nullable().describe('For giftideas lists: who the ideas are for'),
	editors: z.array(z.string()),
})

export const groupSchema = z.object({
	id: z.number(),
	type: z.enum(groupTypeEnumValues).describe('or: pick one of these. order: buy in sequence.'),
	name: z.string().nullable(),
	priority: z.enum(priorityEnumValues),
	itemIds: z.array(z.number()),
})

export const getListOutput = {
	list: z.object({
		id: z.number(),
		name: z.string(),
		type: z.enum(listTypeEnumValues),
		description: z.string().nullable(),
		isPrimary: z.boolean(),
		isPrivate: z.boolean(),
		isActive: z.boolean(),
		ownerId: z.string(),
		subjectDependentId: z.string().nullable(),
		giftIdeasFor: personRefSchema
			.nullable()
			.describe('For giftideas lists: who the ideas are for. They did not ask for these items and cannot see this list.'),
	}),
	items: z.array(itemSchema),
	groups: z.array(groupSchema),
	reveal: z.object({
		applies: z.boolean(),
		eventDate: z.string().nullable(),
		effectiveArchiveDate: z.string().nullable().describe('When claimed gifts on this list are revealed to the recipient'),
		lastArchivedAt: z.string().nullable(),
	}),
}

function toListRow(
	row: MyListRow,
	role: z.infer<typeof listRoleSchema>,
	forPerson: z.infer<typeof personRefSchema> | null
): z.infer<typeof myListSchema> {
	const target = row.giftIdeasTarget
		? { kind: 'user' as const, id: row.giftIdeasTarget.id, name: row.giftIdeasTarget.name ?? row.giftIdeasTarget.email }
		: row.giftIdeasTargetDependent
			? { kind: 'dependent' as const, id: row.giftIdeasTargetDependent.id, name: row.giftIdeasTargetDependent.name }
			: null
	return {
		id: row.id,
		name: row.name,
		type: row.type,
		isPrimary: row.isPrimary,
		isPrivate: row.isPrivate,
		isActive: row.isActive,
		description: row.description,
		itemCount: row.itemCount,
		role,
		forPerson,
		giftIdeasTarget: target,
		editors: row.editors.map(e => e.name ?? e.email),
	}
}

export function registerListTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'list_my_lists',
		title: 'My Lists',
		description:
			'Every list the user can edit: their own (wishlists, birthday, Christmas, holiday, gift-ideas), lists shared with them as an editor, and lists belonging to children or dependents they manage. Owner view: never includes claims.',
		inputSchema: {},
		outputSchema: { lists: z.array(myListSchema) },
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (_args, { actor, dbx }) => {
			const result = await getMyListsImpl(actor.userId, dbx)
			const rows: Array<z.infer<typeof myListSchema>> = [
				...[...result.public, ...result.private, ...result.giftIdeas].map(r => toListRow(r, 'owner', null)),
				...result.editable.map(r =>
					toListRow(
						r,
						'editor',
						r.subjectDependentId
							? { kind: 'dependent', id: r.subjectDependentId, name: r.subjectDependentName }
							: { kind: 'user', id: '', name: r.ownerName ?? r.ownerEmail }
					)
				),
				...result.children.flatMap(c =>
					c.lists.map(r => toListRow(r, 'guardian', { kind: 'user', id: c.childId, name: c.childName ?? c.childEmail }))
				),
				...result.dependents.flatMap(d =>
					d.lists.map(r => toListRow(r, 'dependent-guardian', { kind: 'dependent', id: d.dependentId, name: d.dependentName }))
				),
			]
			const text = rows.length
				? lines(
						rows.map(r => {
							const who = r.forPerson
								? ` for ${r.forPerson.name ?? 'someone'}`
								: r.type === 'giftideas'
									? `, your private ideas${r.giftIdeasTarget ? ` for ${r.giftIdeasTarget.name ?? 'someone'}` : ''}, not their list`
									: ''
							const flags = [r.isPrimary ? 'primary' : '', r.isPrivate ? 'private' : '', r.isActive ? '' : 'archived']
								.filter(Boolean)
								.join(', ')
							return `#${r.id} "${r.name}" (${r.type}${who}, ${plural(r.itemCount, 'item')}${flags ? `, ${flags}` : ''})`
						})
					)
				: 'No lists yet.'
			return toolOk(text, { lists: rows })
		},
	})

	defineTool(server, ctx, {
		name: 'get_list',
		title: 'Get List',
		description:
			'A list the user owns or can edit, with its items, item groups, and reveal schedule. Owner view: claims are never included, so never guess whether something was bought. A giftideas list holds the user’s private ideas for someone else, not things that person asked for. Use get_wishlist for other people’s lists.',
		inputSchema: {
			list_id: z.number().int().positive(),
			include_archived: z.boolean().optional().describe('Also return items already revealed/received (default false)'),
		},
		outputSchema: getListOutput,
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async ({ list_id: listId, include_archived: includeArchived }, { actor, dbx, now }) => {
			const result = await getItemsForListEditImpl({
				userId: actor.userId,
				listId: String(listId),
				includeArchived: includeArchived ?? false,
				dbx,
			})
			if (result.kind === 'error') return toolError(result.reason)
			const header = await dbx.query.lists.findFirst({
				where: eq(lists.id, listId),
				columns: {
					id: true,
					name: true,
					type: true,
					description: true,
					isPrimary: true,
					isPrivate: true,
					isActive: true,
					ownerId: true,
					subjectDependentId: true,
				},
				with: {
					giftIdeasTarget: { columns: { id: true, name: true, email: true } },
					giftIdeasTargetDependent: { columns: { id: true, name: true } },
				},
			})
			if (!header) return toolError('not-found')
			const { giftIdeasTarget, giftIdeasTargetDependent, ...listHeader } = header
			const giftIdeasFor =
				header.type !== 'giftideas'
					? null
					: giftIdeasTarget
						? { kind: 'user' as const, id: giftIdeasTarget.id, name: giftIdeasTarget.name ?? giftIdeasTarget.email }
						: giftIdeasTargetDependent
							? { kind: 'dependent' as const, id: giftIdeasTargetDependent.id, name: giftIdeasTargetDependent.name }
							: null
			const [groups, archive] = await Promise.all([getGroupsForListImpl({ listId }), loadArchiveBannerInfo(listId, dbx, now)])

			const items = result.items.map(i => toItemShape(i, i.commentCount))
			const structured = {
				list: { ...listHeader, giftIdeasFor },
				items,
				groups: groups.map(g => ({ id: g.id, type: g.type, name: g.name, priority: g.priority, itemIds: g.itemIds })),
				reveal: {
					applies: archive.applies,
					eventDate: archive.eventDate,
					effectiveArchiveDate: archive.effectiveArchiveDate,
					lastArchivedAt: archive.lastArchivedAt,
				},
			}
			const text = lines(
				[
					`List #${header.id} "${header.name}" (${header.type}${header.isPrimary ? ', primary' : ''}${header.isPrivate ? ', private' : ''}): ${plural(items.length, 'item')}, ${plural(groups.length, 'group')}.`,
					header.type === 'giftideas'
						? `These are your private gift ideas${giftIdeasFor?.name ? ` for ${giftIdeasFor.name}` : ''}, not things ${giftIdeasFor?.name ?? 'they'} asked for. ${giftIdeasFor?.name ?? 'They'} cannot see this list.`
						: '',
					...items.map(itemLine),
					archive.applies && archive.effectiveArchiveDate
						? `Claimed gifts reveal to the recipient on ${archive.effectiveArchiveDate.slice(0, 10)}.`
						: '',
				].filter(Boolean)
			)
			return toolOk(text, structured)
		},
	})
}
