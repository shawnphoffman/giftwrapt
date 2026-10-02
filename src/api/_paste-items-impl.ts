// Server-only impl for the "Paste Text" import source: free text in,
// item drafts out. Nothing is written here; the drafts go to the import
// preview and are created through `bulkCreateItemsImpl`, so every create
// gate (edit access, todo lists, the import switch) still applies.

import { z } from 'zod'

import { db, type SchemaDatabase } from '@/db'
import { AiBudgetExceededError, aiGenerateObject } from '@/lib/ai-call'
import { createAiModel } from '@/lib/ai-client'
import { resolveAiConfig } from '@/lib/ai-config'
import { createLogger } from '@/lib/logger'
import {
	buildPasteItemsUserPrompt,
	type ExtractedItem,
	MAX_PASTE_CHARS,
	PASTE_ITEMS_SYSTEM,
	pasteItemsResponseSchema,
	sanitizeExtractedItems,
} from '@/lib/paste-items/prompt'
import { getAppSettings } from '@/lib/settings-loader'

const log = createLogger('paste-items')

export const ExtractItemsFromTextInputSchema = z.object({
	text: z.string().trim().min(1).max(MAX_PASTE_CHARS),
})

export type ExtractItemsFromTextResult =
	| { kind: 'ok'; items: Array<ExtractedItem> }
	| { kind: 'error'; reason: 'feature-disabled' | 'not-configured' | 'ai-budget-exceeded' | 'ai-failed' | 'rate-limited' }

export async function extractItemsFromTextImpl(args: {
	actor: { id: string }
	input: z.infer<typeof ExtractItemsFromTextInputSchema>
	dbx?: SchemaDatabase
}): Promise<ExtractItemsFromTextResult> {
	const { actor, input, dbx = db } = args
	const settings = await getAppSettings(dbx)
	if (!settings.aiPasteToItemsEnabled || !settings.importEnabled) return { kind: 'error', reason: 'feature-disabled' }
	const aiConfig = await resolveAiConfig(db)
	if (!aiConfig.isValid) return { kind: 'error', reason: 'not-configured' }

	const model = createAiModel({
		providerType: aiConfig.providerType.value!,
		apiKey: aiConfig.apiKey.value!,
		model: aiConfig.model.value!,
		baseUrl: aiConfig.baseUrl.value,
	})

	try {
		const result = await aiGenerateObject(
			{ feature: 'paste-to-items', userId: actor.id, source: 'web', db: dbx },
			{
				model,
				schema: pasteItemsResponseSchema,
				system: PASTE_ITEMS_SYSTEM,
				prompt: buildPasteItemsUserPrompt(input.text),
				maxOutputTokens: aiConfig.maxOutputTokens.value,
			}
		)
		return { kind: 'ok', items: sanitizeExtractedItems(result.object.items, input.text) }
	} catch (err) {
		if (err instanceof AiBudgetExceededError) return { kind: 'error', reason: 'ai-budget-exceeded' }
		log.warn({ err: err instanceof Error ? err.message : String(err) }, 'paste-to-items call failed')
		return { kind: 'error', reason: 'ai-failed' }
	}
}
