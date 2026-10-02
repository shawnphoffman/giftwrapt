// Server-only impl for thank-you note drafts on the received-gifts page.
//
// The client names which received rows to thank for; everything that
// reaches the prompt is looked up again here from `getReceivedGiftsImpl`,
// which only returns revealed gifts on the caller's own lists (and their
// dependents'). An id that is not one of the caller's revealed gifts is
// refused, so this can never be used to read an unrevealed claim.

import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { AiBudgetExceededError, aiGenerateText } from '@/lib/ai-call'
import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'
import { safeFirstName } from '@/lib/first-name'
import { createLogger } from '@/lib/logger'
import { getAppSettings } from '@/lib/settings-loader'
import { buildThankYouUserPrompt, cleanNote, MAX_THANK_YOU_GIFTS, THANK_YOU_SYSTEM } from '@/lib/thank-you/prompt'

import { getReceivedGiftsImpl, type ReceivedAddonRow, type ReceivedGiftRow } from './received'

const log = createLogger('thank-you')

export const DraftThankYouInputSchema = z.object({
	// The gifter household being thanked (a `GifterUnit.key` from the page).
	unitKey: z.string().min(1).max(200),
	gifts: z
		.array(z.object({ type: z.enum(['item', 'addon']), id: z.number().int().positive() }))
		.min(1)
		.max(MAX_THANK_YOU_GIFTS),
})

export type DraftThankYouResult =
	| { kind: 'ok'; note: string }
	| { kind: 'error'; reason: 'feature-disabled' | 'not-configured' | 'not-found' | 'ai-budget-exceeded' | 'ai-failed' | 'rate-limited' }

type Row = ReceivedGiftRow | ReceivedAddonRow

export async function draftThankYouImpl(args: {
	actor: { id: string }
	input: z.infer<typeof DraftThankYouInputSchema>
	dbx?: SchemaDatabase
}): Promise<DraftThankYouResult> {
	const { actor, input, dbx = db } = args
	const settings = await getAppSettings(dbx)
	if (!settings.aiThankYouDraftsEnabled) return { kind: 'error', reason: 'feature-disabled' }
	const aiConfig = await resolveAiConfig(db)
	if (!aiConfig.isValid) return { kind: 'error', reason: 'not-configured' }

	const received = await getReceivedGiftsImpl({ userId: actor.id, dbx })
	const sections: Array<{ onBehalfOf: string | null; rows: Array<Row> }> = [
		{ onBehalfOf: null, rows: [...received.gifts, ...received.addons] },
		...received.dependents.map(d => ({ onBehalfOf: d.dependent.name, rows: [...d.gifts, ...d.addons] as Array<Row> })),
	]

	// Every requested gift must be a revealed gift of the caller's, credited
	// to the named household, and all in the same section (one note is
	// either the caller's own or on behalf of one dependent).
	const wanted = new Set(input.gifts.map(g => `${g.type}:${g.id}`))
	const keyOf = (r: Row): string => (r.type === 'item' ? `item:${r.itemId}` : `addon:${r.addonId}`)
	const section = sections.find(s => s.rows.some(r => wanted.has(keyOf(r)) && r.gifterUnits.some(u => u.key === input.unitKey)))
	if (!section) return { kind: 'error', reason: 'not-found' }
	const rows = section.rows.filter(r => wanted.has(keyOf(r)) && r.gifterUnits.some(u => u.key === input.unitKey))
	if (new Set(rows.map(keyOf)).size !== wanted.size) return { kind: 'error', reason: 'not-found' }

	const unit = rows[0].gifterUnits.find(u => u.key === input.unitKey)
	if (!unit) return { kind: 'error', reason: 'not-found' }
	const me = await dbx.query.users.findFirst({ where: (u, { eq }) => eq(u.id, actor.id), columns: { name: true } })

	const userPrompt = buildThankYouUserPrompt({
		fromFirstName: safeFirstName(me?.name, 'Me'),
		onBehalfOf: section.onBehalfOf,
		giverFirstNames: unit.members.map(m => safeFirstName(m.name, 'my friend')),
		giftTitles: rows.map(r => (r.type === 'item' ? r.itemTitle : r.description)),
	})

	const model = createAiModel({
		providerType: aiConfig.providerType.value!,
		apiKey: aiConfig.apiKey.value!,
		model: aiConfig.model.value!,
		baseUrl: aiConfig.baseUrl.value,
	})

	try {
		const result = await aiGenerateText(
			{ feature: 'thank-you-draft', userId: actor.id, source: 'web', db: dbx },
			{ model, system: THANK_YOU_SYSTEM, prompt: userPrompt, maxOutputTokens: aiConfig.maxOutputTokens.value }
		)
		const note = cleanNote(result.text)
		if (!note) return { kind: 'error', reason: 'ai-failed' }
		return { kind: 'ok', note }
	} catch (err) {
		if (err instanceof AiBudgetExceededError) return { kind: 'error', reason: 'ai-budget-exceeded' }
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'thank-you draft call failed')
		return { kind: 'error', reason: 'ai-failed' }
	}
}
