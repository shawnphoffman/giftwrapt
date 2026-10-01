import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { getMyListsImpl, getPublicDependentsImpl, getPublicListsImpl, type PublicList } from '@/api/_lists-impl'
import { getMyPeopleImpl } from '@/api/_permissions-impl'

import type { ToolContext } from '../context'
import { toolOk } from '../errors'
import { birthdayString, daysUntilBirthday, lines, plural } from '../format'
import { defineTool } from '../server'

const publicListSchema = z.object({
	id: z.number(),
	name: z.string(),
	type: z.string(),
	isPrimary: z.boolean(),
	itemsTotal: z.number(),
	itemsRemaining: z.number().describe('Items still needing a gifter'),
	holidayDate: z.string().nullable(),
})

export const personSchema = z.object({
	kind: z.enum(['user', 'dependent']),
	id: z.string(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	image: z.string().nullable(),
	birthday: z.string().nullable(),
	daysUntilBirthday: z.number().nullable(),
	isPartner: z.boolean(),
	isChild: z.boolean().describe('The user is this person’s guardian'),
	canIEdit: z.boolean(),
	lastGiftedAt: z.string().nullable().describe('When the user last claimed something for this person'),
	primaryListId: z.number().nullable(),
	lists: z.array(publicListSchema),
})

function toPublicList(l: PublicList): z.infer<typeof publicListSchema> {
	return {
		id: l.id,
		name: l.name,
		type: l.type,
		isPrimary: l.isPrimary,
		itemsTotal: l.itemsTotal,
		itemsRemaining: l.itemsRemaining,
		holidayDate: l.holidayDate,
	}
}

export function registerPeopleTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'list_people',
		title: 'People I Can Shop For',
		description:
			'Everyone whose lists the user can see and shop from: family, friends, children, and dependents (pets, babies), each with their birthday and their visible lists. Use a person’s primary list id or a list id with get_wishlist to shop. Optional query filters by name or email.',
		inputSchema: { query: z.string().max(100).optional() },
		outputSchema: { people: z.array(personSchema) },
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async ({ query }, { actor, dbx, now }) => {
			const [publicUsers, publicDependents, myPeople, myLists] = await Promise.all([
				getPublicListsImpl(actor.userId),
				getPublicDependentsImpl(actor.userId, dbx),
				getMyPeopleImpl(dbx, actor.userId),
				getMyListsImpl(actor.userId, dbx),
			])
			const flags = new Map(myPeople.map(p => [p.id, p]))
			const childIds = new Set(myLists.children.map(c => c.childId))

			const people: Array<z.infer<typeof personSchema>> = [
				...publicUsers.map(u => {
					const f = flags.get(u.id)
					return {
						kind: 'user' as const,
						id: u.id,
						name: u.name,
						email: u.email,
						image: u.image,
						birthday: birthdayString(u.birthMonth, u.birthDay, null),
						daysUntilBirthday: daysUntilBirthday(u.birthMonth, u.birthDay, now),
						isPartner: f?.isPartner ?? false,
						isChild: childIds.has(u.id),
						canIEdit: childIds.has(u.id) || (f?.canIEditTheirList ?? false),
						lastGiftedAt: u.lastGiftedAt,
						primaryListId: u.lists.find(l => l.isPrimary)?.id ?? null,
						lists: u.lists.map(toPublicList),
					}
				}),
				...publicDependents.map(d => ({
					kind: 'dependent' as const,
					id: d.id,
					name: d.name,
					email: null,
					image: d.image,
					birthday: birthdayString(d.birthMonth, d.birthDay, null),
					daysUntilBirthday: daysUntilBirthday(d.birthMonth, d.birthDay, now),
					isPartner: false,
					isChild: false,
					canIEdit: d.guardianIds.includes(actor.userId),
					lastGiftedAt: d.lastGiftedAt,
					primaryListId: d.lists.find(l => l.isPrimary)?.id ?? null,
					lists: d.lists.map(toPublicList),
				})),
			]

			const q = query?.trim().toLowerCase()
			const filtered = q
				? people.filter(p => (p.name ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q))
				: people
			filtered.sort((a, b) => {
				const da = a.daysUntilBirthday ?? Number.POSITIVE_INFINITY
				const db = b.daysUntilBirthday ?? Number.POSITIVE_INFINITY
				if (da !== db) return da - db
				return (a.name ?? '').localeCompare(b.name ?? '')
			})

			const text = filtered.length
				? lines(
						filtered.map(p => {
							const tags = [p.isPartner ? 'partner' : '', p.isChild ? 'child' : '', p.kind === 'dependent' ? 'dependent' : ''].filter(
								Boolean
							)
							const bday = p.daysUntilBirthday !== null ? `birthday in ${plural(p.daysUntilBirthday, 'day')}` : 'no birthday'
							const listsText = p.lists.length
								? p.lists.map(l => `#${l.id} "${l.name}" (${l.itemsRemaining}/${l.itemsTotal} open)`).join('; ')
								: 'no visible lists'
							return `${p.name ?? p.email ?? p.id} [${p.kind}${tags.length ? `, ${tags.join(', ')}` : ''}] ${bday}. Lists: ${listsText}`
						})
					)
				: q
					? `Nobody matches "${query}".`
					: 'Nobody has shared a list with you yet.'
			return toolOk(text, { people: filtered })
		},
	})
}
