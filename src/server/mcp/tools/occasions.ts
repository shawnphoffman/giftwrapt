import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'

import { getMyListsImpl, getPublicDependentsImpl, getPublicListsImpl } from '@/api/_lists-impl'
import { getPurchaseSummaryImpl } from '@/api/_purchases-impl'
import { getUpcomingHolidaysImpl } from '@/api/_widgets-impl'
import { getReceivedGiftsImpl } from '@/api/received'

import type { ToolContext } from '../context'
import { toolOk } from '../errors'
import { birthdayString, daysUntilBirthday, lines, plural } from '../format'
import { defineTool } from '../server'

const personRef = z.object({ kind: z.enum(['user', 'dependent']), id: z.string(), name: z.string().nullable() })

const occasionSchema = z.object({
	kind: z.enum(['birthday', 'christmas', 'holiday', 'mothers-day', 'fathers-day', 'valentines', 'anniversary']),
	title: z.string(),
	date: z.string().describe('YYYY-MM-DD'),
	daysUntil: z.number(),
	person: personRef.nullable().describe('Who the occasion is for; null for deployment-wide holidays'),
	primaryListId: z.number().nullable(),
	giftsAlreadyPlanned: z.number().describe('Claims and off-list gifts the user has for this person in the last year'),
})

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

export function registerOccasionTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'list_upcoming_occasions',
		title: 'Upcoming Occasions',
		description:
			'Birthdays of everyone the user can shop for (including children and dependents), plus the holidays this deployment celebrates and the user’s anniversary, within the next N days, each with whether the user has already planned a gift. Sorted soonest first.',
		inputSchema: { days: z.number().int().min(1).max(366).optional().describe('Horizon in days (default 60)') },
		outputSchema: { occasions: z.array(occasionSchema) },
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (args, { actor, dbx, now }) => {
			const horizon = args.days ?? 60
			const [publicUsers, publicDependents, myLists, holidays, purchases] = await Promise.all([
				getPublicListsImpl(actor.userId),
				getPublicDependentsImpl(actor.userId, dbx),
				getMyListsImpl(actor.userId, dbx),
				getUpcomingHolidaysImpl({ userId: actor.userId, limit: 50, horizonDays: horizon, now, dbx }),
				getPurchaseSummaryImpl(actor.userId, dbx),
			])

			const recent = purchases.items.filter(p => now.getTime() - p.createdAt.getTime() < YEAR_MS)
			const plannedFor = (recipientId: string): number =>
				recent.filter(p => (p.recipientKind === 'dependent' ? p.subjectDependentId : p.ownerId) === recipientId).length

			const occasions: Array<z.infer<typeof occasionSchema>> = []
			const seen = new Set<string>()
			const pushBirthday = (
				person: z.infer<typeof personRef>,
				month: Parameters<typeof daysUntilBirthday>[0],
				day: number | null,
				primaryListId: number | null
			) => {
				if (seen.has(person.id)) return
				const d = daysUntilBirthday(month, day, now)
				if (d === null || d > horizon) return
				seen.add(person.id)
				const dateStr = birthdayString(month, day, now.getUTCFullYear() + (d < 0 ? 1 : 0)) ?? ''
				occasions.push({
					kind: 'birthday',
					title: `${person.name ?? 'Someone'}’s birthday`,
					date: dateStr.startsWith('--') ? dateStr : dateStr,
					daysUntil: d,
					person,
					primaryListId,
					giftsAlreadyPlanned: plannedFor(person.id),
				})
			}
			for (const u of publicUsers)
				pushBirthday(
					{ kind: 'user', id: u.id, name: u.name ?? u.email },
					u.birthMonth,
					u.birthDay,
					u.lists.find(l => l.isPrimary)?.id ?? null
				)
			for (const c of myLists.children)
				pushBirthday(
					{ kind: 'user', id: c.childId, name: c.childName ?? c.childEmail },
					c.birthMonth,
					c.birthDay,
					c.lists.find(l => l.isPrimary)?.id ?? null
				)
			for (const d of publicDependents)
				pushBirthday({ kind: 'dependent', id: d.id, name: d.name }, d.birthMonth, d.birthDay, d.lists.find(l => l.isPrimary)?.id ?? null)
			for (const d of myLists.dependents)
				pushBirthday(
					{ kind: 'dependent', id: d.dependentId, name: d.dependentName },
					d.birthMonth,
					d.birthDay,
					d.lists.find(l => l.isPrimary)?.id ?? null
				)

			for (const h of holidays) {
				const kind = h.source === 'custom' ? 'holiday' : h.source
				occasions.push({
					kind,
					title: h.title,
					date: h.occurrenceStart.slice(0, 10),
					daysUntil: h.daysUntil,
					person: null,
					primaryListId: null,
					giftsAlreadyPlanned: 0,
				})
			}

			occasions.sort((a, b) => a.daysUntil - b.daysUntil || a.title.localeCompare(b.title))
			const text = occasions.length
				? lines(
						occasions.map(
							o =>
								`${o.date} (in ${plural(o.daysUntil, 'day')}): ${o.title}${o.person ? ` [${o.person.kind} id ${o.person.id}, ${o.giftsAlreadyPlanned ? `${plural(o.giftsAlreadyPlanned, 'gift')} planned` : 'nothing planned yet'}${o.primaryListId ? `, list #${o.primaryListId}` : ''}]` : ''}`
						)
					)
				: `Nothing in the next ${plural(horizon, 'day')}.`
			return toolOk(text, { occasions })
		},
	})

	defineTool(server, ctx, {
		name: 'list_received_gifts',
		title: 'Gifts I Received',
		description:
			'Gifts that have been revealed to the user (and to dependents they manage): what was given and by whom. Only revealed gifts appear; unrevealed claims stay hidden.',
		inputSchema: {},
		outputSchema: {
			gifts: z.array(
				z.object({
					kind: z.enum(['item', 'off-list']),
					id: z.number(),
					title: z.string(),
					url: z.string().nullable(),
					listName: z.string(),
					from: z.array(z.string()),
					revealedAt: z.string(),
					recipient: z.object({ kind: z.enum(['self', 'dependent']), id: z.string(), name: z.string().nullable() }),
				})
			),
		},
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (_args, { actor, dbx }) => {
			const result = await getReceivedGiftsImpl({ userId: actor.userId, dbx })
			const rows: Array<{
				kind: 'item' | 'off-list'
				id: number
				title: string
				url: string | null
				listName: string
				from: Array<string>
				revealedAt: string
				recipient: { kind: 'self' | 'dependent'; id: string; name: string | null }
			}> = []
			const self = { kind: 'self' as const, id: actor.userId, name: null }
			for (const g of result.gifts)
				rows.push({
					kind: 'item',
					id: g.itemId,
					title: g.itemTitle,
					url: g.itemUrl,
					listName: g.listName,
					from: g.gifterNames,
					revealedAt: g.archivedAt.toISOString(),
					recipient: self,
				})
			for (const a of result.addons)
				rows.push({
					kind: 'off-list',
					id: a.addonId,
					title: a.description,
					url: a.url,
					listName: a.listName,
					from: a.gifterNames,
					revealedAt: a.archivedAt.toISOString(),
					recipient: self,
				})
			for (const section of result.dependents) {
				const recipient = { kind: 'dependent' as const, id: section.dependent.id, name: section.dependent.name }
				for (const g of section.gifts)
					rows.push({
						kind: 'item',
						id: g.itemId,
						title: g.itemTitle,
						url: g.itemUrl,
						listName: g.listName,
						from: g.gifterNames,
						revealedAt: g.archivedAt.toISOString(),
						recipient,
					})
				for (const a of section.addons)
					rows.push({
						kind: 'off-list',
						id: a.addonId,
						title: a.description,
						url: a.url,
						listName: a.listName,
						from: a.gifterNames,
						revealedAt: a.archivedAt.toISOString(),
						recipient,
					})
			}
			rows.sort((a, b) => b.revealedAt.localeCompare(a.revealedAt))
			const text = rows.length
				? lines(
						rows.map(
							r =>
								`${r.revealedAt.slice(0, 10)}: ${r.title} from ${r.from.join(' & ') || 'someone'}${r.recipient.kind === 'dependent' ? ` (for ${r.recipient.name})` : ''} [${r.listName}]`
						)
					)
				: 'No revealed gifts yet.'
			return toolOk(text, { gifts: rows })
		},
	})
}
