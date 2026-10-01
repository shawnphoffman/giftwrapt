import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { getMyDependentsImpl } from '@/api/_dependents-impl'
import { getMyListsImpl } from '@/api/_lists-impl'
import { users } from '@/db/schema'
import { listTypeEnumValues } from '@/db/schema'

import type { ToolContext } from '../context'
import { toolError, toolOk } from '../errors'
import { birthdayString, lines, plural } from '../format'
import { defineTool } from '../server'

const personSchema = z.object({
	id: z.string(),
	name: z.string().nullable(),
	email: z.string().nullable(),
	image: z.string().nullable(),
	birthday: z.string().nullable().describe('YYYY-MM-DD, or --MM-DD when the year is unknown'),
})

export const getMeOutput = {
	user: z.object({
		id: z.string(),
		name: z.string().nullable(),
		email: z.string(),
		image: z.string().nullable(),
		isAdmin: z.boolean(),
		birthday: z.string().nullable(),
		partnerAnniversary: z.string().nullable(),
	}),
	partner: personSchema.nullable(),
	children: z.array(personSchema).describe('Users this account is a guardian of'),
	dependents: z
		.array(z.object({ id: z.string(), name: z.string(), birthday: z.string().nullable() }))
		.describe('Non-user recipients (pets, babies) this account is a guardian of'),
	primaryList: z.object({ id: z.number(), name: z.string(), type: z.string() }).nullable(),
	features: z.object({
		comments: z.boolean(),
		intelligence: z.boolean(),
		barcodeLookup: z.boolean(),
		listTypes: z.array(z.enum(listTypeEnumValues)).describe('List types that can be created on this deployment'),
	}),
}

export function registerMeTools(server: McpServer, ctx: ToolContext): void {
	defineTool(server, ctx, {
		name: 'get_me',
		title: 'Who Am I',
		description:
			'The signed-in user: profile, partner, children and dependents they manage, their primary list, and which features this deployment has turned on. Call this first.',
		inputSchema: {},
		outputSchema: getMeOutput,
		annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true },
		handler: async (_args, { actor, dbx, settings }) => {
			const me = await dbx.query.users.findFirst({
				where: eq(users.id, actor.userId),
				columns: {
					id: true,
					name: true,
					email: true,
					image: true,
					role: true,
					partnerId: true,
					partnerAnniversary: true,
					birthMonth: true,
					birthDay: true,
					birthYear: true,
				},
			})
			if (!me) return toolError('not-found', 'Your account could not be loaded.')
			const partner = me.partnerId
				? await dbx.query.users.findFirst({
						where: eq(users.id, me.partnerId),
						columns: { id: true, name: true, email: true, image: true, birthMonth: true, birthDay: true, birthYear: true },
					})
				: null
			const [dependents, myLists] = await Promise.all([
				getMyDependentsImpl({ userId: actor.userId, dbx }),
				getMyListsImpl(actor.userId, dbx),
			])
			const owned = [...myLists.public, ...myLists.private, ...myLists.giftIdeas]
			const primary = owned.find(l => l.isPrimary) ?? null

			const listTypes = listTypeEnumValues.filter(t => {
				if (t === 'christmas') return settings.enableChristmasLists
				if (t === 'birthday') return settings.enableBirthdayLists
				if (t === 'holiday') return settings.enableGenericHolidayLists
				if (t === 'todos') return settings.enableTodoLists
				if (t === 'test') return false
				return true
			})

			const structured = {
				user: {
					id: me.id,
					name: me.name,
					email: me.email,
					image: me.image,
					isAdmin: me.role === 'admin',
					birthday: birthdayString(me.birthMonth, me.birthDay, me.birthYear),
					partnerAnniversary: me.partnerAnniversary ?? null,
				},
				partner: partner
					? {
							id: partner.id,
							name: partner.name,
							email: partner.email,
							image: partner.image,
							birthday: birthdayString(partner.birthMonth, partner.birthDay, partner.birthYear),
						}
					: null,
				children: myLists.children.map(c => ({
					id: c.childId,
					name: c.childName,
					email: c.childEmail,
					image: c.childImage,
					birthday: birthdayString(c.birthMonth, c.birthDay, c.birthYear),
				})),
				dependents: dependents.dependents
					.filter(d => !d.isArchived)
					.map(d => ({ id: d.id, name: d.name, birthday: birthdayString(d.birthMonth, d.birthDay, d.birthYear) })),
				primaryList: primary ? { id: primary.id, name: primary.name, type: primary.type } : null,
				features: {
					comments: settings.enableComments,
					intelligence: settings.intelligenceEnabled,
					barcodeLookup: settings.enableMobileApp && settings.barcode.enabled,
					listTypes,
				},
			}

			const text = lines(
				[
					`You are ${me.name ?? me.email} (${me.email})${me.role === 'admin' ? ', an admin' : ''}.`,
					partner ? `Partner: ${partner.name ?? partner.email}.` : 'No partner set.',
					structured.children.length ? `Children you manage: ${structured.children.map(c => c.name ?? c.email).join(', ')}.` : '',
					structured.dependents.length ? `Dependents you manage: ${structured.dependents.map(d => d.name).join(', ')}.` : '',
					primary
						? `Primary list: "${primary.name}" (id ${primary.id}, ${primary.type}).`
						: `No primary list. You own ${plural(owned.length, 'list')}.`,
					`Features: comments ${settings.enableComments ? 'on' : 'off'}, intelligence ${settings.intelligenceEnabled ? 'on' : 'off'}. List types: ${listTypes.join(', ')}.`,
				].filter(Boolean)
			)
			return toolOk(text, structured)
		},
	})
}
