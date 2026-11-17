import { createServerFn } from '@tanstack/react-start'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { aiGenerateText } from '@/lib/ai-call'
import { createAiModel } from '@/lib/ai-client'
import {
	AI_SETTING_KEYS,
	AI_SLOT_SETTING_KEYS,
	type AiSettingKey,
	type AiSlotMode,
	type AiSlotSettingKey,
	envLockedFlags,
	resolveAiConfig,
	resolveAiSlotFields,
	slotEnvLockedFlags,
} from '@/lib/ai-config'
import { type ListModelsResult, listProviderModels } from '@/lib/ai-models'
import { AI_EXTRA_SLOTS, type AiExtraSlot } from '@/lib/ai-slots'
import { DEFAULT_MAX_OUTPUT_TOKENS, type FieldSource, PROVIDER_TYPES, type ProviderType } from '@/lib/ai-types'
import { type AiUsageSummary, getAiUsageSummary } from '@/lib/ai-usage'
import { encryptAppSecret } from '@/lib/crypto/app-secret'
import { createLogger } from '@/lib/logger'
import { LIMITS } from '@/lib/validation/limits'
import { adminAuthMiddleware } from '@/middleware/auth'

const adminAiLog = createLogger('admin:ai')

export type AiConfigResponse = {
	providerType: { source: FieldSource; value?: ProviderType }
	baseUrl: { source: FieldSource; value?: string }
	apiKey: { source: FieldSource; preview?: string }
	model: { source: FieldSource; value?: string }
	maxOutputTokens: { source: FieldSource; value: number }
	envLocked: {
		providerType: boolean
		baseUrl: boolean
		apiKey: boolean
		model: boolean
		maxOutputTokens: boolean
	}
	isValid: boolean
}

function apiKeyPreview(value: string): string {
	const last4 = value.slice(-4)
	const prefix = value.startsWith('sk-') ? 'sk-' : ''
	return `${prefix}••••${last4}`
}

export const fetchAiConfigAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware])
	.handler(async (): Promise<AiConfigResponse> => {
		const cfg = await resolveAiConfig(db)
		return {
			providerType: { source: cfg.providerType.source, value: cfg.providerType.value },
			baseUrl: { source: cfg.baseUrl.source, value: cfg.baseUrl.value },
			apiKey: {
				source: cfg.apiKey.source,
				preview: cfg.apiKey.value ? apiKeyPreview(cfg.apiKey.value) : undefined,
			},
			model: { source: cfg.model.source, value: cfg.model.value },
			maxOutputTokens: {
				source: cfg.maxOutputTokens.source,
				value: cfg.maxOutputTokens.value ?? DEFAULT_MAX_OUTPUT_TOKENS,
			},
			envLocked: envLockedFlags(),
			isValid: cfg.isValid,
		}
	})

const providerTypeSchema = z.enum(PROVIDER_TYPES as unknown as [ProviderType, ...Array<ProviderType>])

const updateInputSchema = z
	.object({
		providerType: z.union([providerTypeSchema, z.null()]).optional(),
		baseUrl: z.union([z.url().max(LIMITS.URL), z.null()]).optional(),
		apiKey: z.union([z.string().min(1).max(LIMITS.SECRET), z.null()]).optional(),
		model: z.union([z.string().min(1).max(LIMITS.SHORT_NAME), z.null()]).optional(),
		maxOutputTokens: z.union([z.number().int().min(1).max(64_000), z.null()]).optional(),
	})
	.strict()

type UpdateInput = z.infer<typeof updateInputSchema>

export type UpdateAiConfigResult = { ok: true } | { ok: false; error: string }

async function upsertSetting(key: AiSettingKey | AiSlotSettingKey, value: unknown) {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
		target: appSettings.key,
		set: { value },
	})
}

async function deleteSetting(key: AiSettingKey | AiSlotSettingKey) {
	await db.delete(appSettings).where(eq(appSettings.key, key))
}

export const updateAiConfigAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: UpdateInput) => updateInputSchema.parse(data))
	.handler(async ({ data }): Promise<UpdateAiConfigResult> => {
		const locks = envLockedFlags()

		const envRejections: Array<string> = []
		if (data.providerType !== undefined && locks.providerType) envRejections.push('providerType')
		if (data.baseUrl !== undefined && locks.baseUrl) envRejections.push('baseUrl')
		if (data.apiKey !== undefined && locks.apiKey) envRejections.push('apiKey')
		if (data.model !== undefined && locks.model) envRejections.push('model')
		if (data.maxOutputTokens !== undefined && locks.maxOutputTokens) envRejections.push('maxOutputTokens')
		if (envRejections.length > 0) {
			return {
				ok: false,
				error: `The following fields are set by environment variables and cannot be changed here: ${envRejections.join(', ')}.`,
			}
		}

		if (data.providerType !== undefined) {
			if (data.providerType === null) await deleteSetting(AI_SETTING_KEYS.providerType)
			else await upsertSetting(AI_SETTING_KEYS.providerType, data.providerType)
		}
		if (data.baseUrl !== undefined) {
			if (data.baseUrl === null) await deleteSetting(AI_SETTING_KEYS.baseUrl)
			else await upsertSetting(AI_SETTING_KEYS.baseUrl, data.baseUrl)
		}
		if (data.apiKey !== undefined) {
			if (data.apiKey === null) {
				await deleteSetting(AI_SETTING_KEYS.apiKey)
			} else {
				await upsertSetting(AI_SETTING_KEYS.apiKey, encryptAppSecret(data.apiKey))
			}
		}
		if (data.model !== undefined) {
			if (data.model === null) await deleteSetting(AI_SETTING_KEYS.model)
			else await upsertSetting(AI_SETTING_KEYS.model, data.model)
		}
		if (data.maxOutputTokens !== undefined) {
			if (data.maxOutputTokens === null) await deleteSetting(AI_SETTING_KEYS.maxOutputTokens)
			else await upsertSetting(AI_SETTING_KEYS.maxOutputTokens, data.maxOutputTokens)
		}

		adminAiLog.info({ changedKeys: Object.keys(data) }, 'ai config updated')
		return { ok: true }
	})

const slotSchema = z.enum(AI_EXTRA_SLOTS)

// ─── Model slots (plan 34) ──────────────────────────────────────────────────

export type AiSlotResponse = {
	slot: AiExtraSlot
	// How the slot resolves right now; see ResolvedAiConfig.slotMode.
	mode: AiSlotMode
	// The slot's own saved fields. Empty fields are borrowed from the main
	// config unless the slot has its own provider.
	providerType: { source: FieldSource; value?: ProviderType }
	baseUrl: { source: FieldSource; value?: string }
	apiKey: { source: FieldSource; preview?: string }
	model: { source: FieldSource; value?: string }
	envLocked: { providerType: boolean; baseUrl: boolean; apiKey: boolean; model: boolean }
}

export type AiSlotsResponse = Record<AiExtraSlot, AiSlotResponse>

async function loadSlotResponse(slot: AiExtraSlot): Promise<AiSlotResponse> {
	const { fields, resolved } = await resolveAiSlotFields(db, slot)
	return {
		slot,
		mode: resolved.slotMode,
		providerType: fields.providerType,
		baseUrl: fields.baseUrl,
		apiKey: { source: fields.apiKey.source, preview: fields.apiKey.value ? apiKeyPreview(fields.apiKey.value) : undefined },
		model: fields.model,
		envLocked: slotEnvLockedFlags(slot),
	}
}

export const fetchAiSlotsAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware])
	.handler(async (): Promise<AiSlotsResponse> => {
		const [fast, vision] = await Promise.all([loadSlotResponse('fast'), loadSlotResponse('vision')])
		return { fast, vision }
	})

// The whole slot in one write, so a half-saved slot cannot exist:
// - `model: null` with no provider clears the slot (it follows the default).
// - `model` with `provider: null` runs that model on the default provider.
// - `provider` set gives the slot its own provider. The model is then
//   required, and so is a key: a new one, or the one already saved for the
//   same provider type.
const updateSlotInputSchema = z
	.object({
		slot: slotSchema,
		model: z.union([z.string().min(1).max(LIMITS.SHORT_NAME), z.null()]),
		provider: z.union([
			z.null(),
			z
				.object({
					providerType: providerTypeSchema,
					baseUrl: z.union([z.url().max(LIMITS.URL), z.null()]),
					apiKey: z.string().min(1).max(LIMITS.SECRET).optional(),
				})
				.strict(),
		]),
	})
	.strict()

export type UpdateAiSlotInput = z.infer<typeof updateSlotInputSchema>

export const updateAiSlotAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: UpdateAiSlotInput) => updateSlotInputSchema.parse(data))
	.handler(async ({ data }): Promise<UpdateAiConfigResult> => {
		const keys = AI_SLOT_SETTING_KEYS[data.slot]
		const locks = slotEnvLockedFlags(data.slot)
		const { fields } = await resolveAiSlotFields(db, data.slot)

		// What the slot will hold after this write. An env-locked field keeps
		// its environment value whatever the form sent.
		const next = {
			providerType: locks.providerType ? fields.providerType.value : (data.provider?.providerType ?? undefined),
			baseUrl: locks.baseUrl ? fields.baseUrl.value : (data.provider?.baseUrl ?? undefined),
			model: locks.model ? fields.model.value : (data.model ?? undefined),
			// A saved key only carries over while the provider type is unchanged.
			apiKey: locks.apiKey
				? fields.apiKey.value
				: (data.provider?.apiKey ??
					(data.provider && fields.apiKey.source === 'db' && fields.providerType.value === data.provider.providerType
						? fields.apiKey.value
						: undefined)),
		}

		if (next.providerType) {
			if (!next.model) return { ok: false, error: 'Pick a model for this provider.' }
			if (!next.apiKey) return { ok: false, error: 'Enter the API key for this provider.' }
			if (next.providerType === 'openai-compatible' && !next.baseUrl) {
				return { ok: false, error: 'Base URL is required for OpenAI-compatible providers.' }
			}
		}

		async function write(field: 'providerType' | 'baseUrl' | 'model', value: string | undefined) {
			if (locks[field]) return
			if (value === undefined) await deleteSetting(keys[field])
			else await upsertSetting(keys[field], value)
		}
		await write('providerType', next.providerType)
		await write('baseUrl', next.providerType === 'openai-compatible' ? next.baseUrl : undefined)
		await write('model', next.model)
		if (!locks.apiKey) {
			if (!next.providerType) await deleteSetting(keys.apiKey)
			else if (data.provider?.apiKey) await upsertSetting(keys.apiKey, encryptAppSecret(data.provider.apiKey))
		}

		adminAiLog.info(
			{ slot: data.slot, ownProvider: Boolean(next.providerType), cleared: !next.providerType && !next.model },
			'ai slot updated'
		)
		return { ok: true }
	})

const testInputSchema = z
	.object({
		// Optional draft overrides. Any field not provided falls back to the
		// currently-saved value (env or db).
		providerType: providerTypeSchema.optional(),
		baseUrl: z.url().max(LIMITS.URL).optional(),
		apiKey: z.string().min(1).max(LIMITS.SECRET).optional(),
		model: z.string().min(1).max(LIMITS.SHORT_NAME).optional(),
		maxOutputTokens: z.number().int().min(1).max(64_000).optional(),
		// Test a model slot instead of the main config. `ownProvider` says
		// which way the form is filling the slot: false borrows the main
		// provider and key, true uses only the slot's own.
		slot: slotSchema.optional(),
		ownProvider: z.boolean().optional(),
	})
	.strict()

// A solid red 64x64 PNG. The vision slot's test asks the model what colour
// it is, so a model that cannot read images fails here and not on a
// user's photo.
const VISION_TEST_PNG_BASE64 =
	'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAIAAAAlC+aJAAAAS0lEQVR42u3PQQkAAAgAsetfWiP4FgYrsKZeS0BAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEDgsqnc8OJg6Ln3AAAAAElFTkSuQmCC'

// The saved values a draft falls back to: the main config, or for a slot
// either the main config with the slot's model (model only) or nothing but
// the slot's own fields (own provider).
async function savedConfigFor(slot: AiExtraSlot | undefined, ownProvider: boolean | undefined) {
	const main = await resolveAiConfig(db)
	const base = {
		providerType: main.providerType.value,
		baseUrl: main.baseUrl.value,
		apiKey: main.apiKey.value,
		model: main.model.value,
		maxOutputTokens: main.maxOutputTokens.value,
	}
	if (!slot) return base
	const { fields } = await resolveAiSlotFields(db, slot)
	if (ownProvider) {
		return {
			providerType: fields.providerType.value,
			baseUrl: fields.baseUrl.value,
			apiKey: fields.apiKey.value,
			model: fields.model.value,
			maxOutputTokens: base.maxOutputTokens,
		}
	}
	return { ...base, model: fields.model.value ?? base.model }
}

export type TestAiConnectionResult = { ok: true; latencyMs: number } | { ok: false; error: string }

export const testAiConnectionAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: z.infer<typeof testInputSchema>) => testInputSchema.parse(data))
	.handler(async ({ data, context }): Promise<TestAiConnectionResult> => {
		const cfg = await savedConfigFor(data.slot, data.ownProvider)
		const providerType = data.providerType ?? cfg.providerType
		// A provider type without a base URL of its own must not pick up the
		// saved one from a different provider.
		const baseUrl = data.baseUrl ?? (data.providerType && data.providerType !== cfg.providerType ? undefined : cfg.baseUrl)
		const apiKey = data.apiKey ?? cfg.apiKey
		const model = data.model ?? cfg.model
		const maxOutputTokens = data.maxOutputTokens ?? cfg.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS

		if (!providerType) return { ok: false, error: 'Provider type is required.' }
		if (!apiKey) return { ok: false, error: 'API key is required.' }
		if (!model) return { ok: false, error: 'Model is required.' }
		if (providerType === 'openai-compatible' && !baseUrl) {
			return { ok: false, error: 'Base URL is required for OpenAI-compatible providers.' }
		}

		const meta = { feature: 'admin-test', userId: context.session.user.id, source: 'admin', bypassBudget: true } as const
		const aiModel = createAiModel({ providerType, apiKey, baseUrl, model })
		const started = Date.now()
		try {
			if (data.slot === 'vision') {
				const { text } = await aiGenerateText(meta, {
					model: aiModel,
					maxOutputTokens,
					messages: [
						{
							role: 'user',
							content: [
								{ type: 'text', text: 'What colour is this image? Answer with one word.' },
								{ type: 'image', image: VISION_TEST_PNG_BASE64, mediaType: 'image/png' },
							],
						},
					],
				})
				if (!/\bred\b/i.test(text)) {
					return { ok: false, error: `${model} answered but did not read the test image. Pick a model that accepts images.` }
				}
				return { ok: true, latencyMs: Date.now() - started }
			}
			await aiGenerateText(meta, { model: aiModel, prompt: 'ping', maxOutputTokens })
			return { ok: true, latencyMs: Date.now() - started }
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to reach AI provider.'
			adminAiLog.warn({ err }, 'ai connection test failed')
			return { ok: false, error: msg }
		}
	})

const listModelsInputSchema = z
	.object({
		// Same draft-override contract as the connection test: anything omitted
		// falls back to the saved (env or db) value.
		providerType: providerTypeSchema.optional(),
		baseUrl: z.url().max(LIMITS.URL).optional(),
		apiKey: z.string().min(1).max(LIMITS.SECRET).optional(),
		refresh: z.boolean().optional(),
		// List for a slot that has its own provider: the saved key and base
		// URL then come from the slot, not the main config.
		slot: slotSchema.optional(),
	})
	.strict()

export type ListAiModelsResult = ListModelsResult

export const listAiModelsAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: z.infer<typeof listModelsInputSchema>) => listModelsInputSchema.parse(data))
	.handler(async ({ data }): Promise<ListAiModelsResult> => {
		const cfg = await savedConfigFor(data.slot, data.slot !== undefined)
		const providerType = data.providerType ?? cfg.providerType
		const sameProvider = !data.providerType || data.providerType === cfg.providerType
		const baseUrl = data.baseUrl ?? (sameProvider ? cfg.baseUrl : undefined)
		// A slot's saved key only fits the provider it was saved for.
		const apiKey = data.apiKey ?? (data.slot && !sameProvider ? undefined : cfg.apiKey)

		if (!providerType) return { ok: false, error: 'Provider type is required.' }
		if (!apiKey) return { ok: false, error: 'An API key is required to list models.' }
		if (providerType === 'openai-compatible' && !baseUrl) {
			return { ok: false, error: 'Base URL is required for OpenAI-compatible providers.' }
		}

		return await listProviderModels({ providerType, apiKey, baseUrl, refresh: data.refresh ?? false })
	})

// Last 30 days of the AI usage ledger, per feature, plus the month-to-date
// estimated spend the monthly ceiling is compared against.
export const fetchAiUsageAsAdmin = createServerFn({ method: 'GET' })
	.middleware([adminAuthMiddleware])
	.handler(async (): Promise<AiUsageSummary> => getAiUsageSummary({ db, now: new Date() }))
