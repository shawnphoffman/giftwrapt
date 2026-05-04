import { createServerFn } from '@tanstack/react-start'
import { generateText } from 'ai'
import { eq } from 'drizzle-orm'
import { z } from 'zod'

import { db } from '@/db'
import { appSettings } from '@/db/schema'
import { createAiModel } from '@/lib/ai-client'
import { AI_SETTING_KEYS, type AiSettingKey, envLockedFlags, resolveAiConfig } from '@/lib/ai-config'
import { DEFAULT_MAX_OUTPUT_TOKENS, type FieldSource, PROVIDER_TYPES, type ProviderType } from '@/lib/ai-types'
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

async function upsertSetting(key: AiSettingKey, value: unknown) {
	await db.insert(appSettings).values({ key, value }).onConflictDoUpdate({
		target: appSettings.key,
		set: { value },
	})
}

async function deleteSetting(key: AiSettingKey) {
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

const testInputSchema = z
	.object({
		// Optional draft overrides. Any field not provided falls back to the
		// currently-saved value (env or db).
		providerType: providerTypeSchema.optional(),
		baseUrl: z.url().max(LIMITS.URL).optional(),
		apiKey: z.string().min(1).max(LIMITS.SECRET).optional(),
		model: z.string().min(1).max(LIMITS.SHORT_NAME).optional(),
		maxOutputTokens: z.number().int().min(1).max(64_000).optional(),
	})
	.strict()

export type TestAiConnectionResult = { ok: true; latencyMs: number } | { ok: false; error: string }

export const testAiConnectionAsAdmin = createServerFn({ method: 'POST' })
	.middleware([adminAuthMiddleware])
	.inputValidator((data: z.infer<typeof testInputSchema>) => testInputSchema.parse(data))
	.handler(async ({ data }): Promise<TestAiConnectionResult> => {
		const cfg = await resolveAiConfig(db)
		const providerType = data.providerType ?? cfg.providerType.value
		const baseUrl = data.baseUrl ?? cfg.baseUrl.value
		const apiKey = data.apiKey ?? cfg.apiKey.value
		const model = data.model ?? cfg.model.value
		const maxOutputTokens = data.maxOutputTokens ?? cfg.maxOutputTokens.value ?? DEFAULT_MAX_OUTPUT_TOKENS

		if (!providerType) return { ok: false, error: 'Provider type is required.' }
		if (!apiKey) return { ok: false, error: 'API key is required.' }
		if (!model) return { ok: false, error: 'Model is required.' }
		if (providerType === 'openai-compatible' && !baseUrl) {
			return { ok: false, error: 'Base URL is required for OpenAI-compatible providers.' }
		}

		const started = Date.now()
		try {
			await generateText({
				model: createAiModel({ providerType, apiKey, baseUrl, model }),
				prompt: 'ping',
				maxOutputTokens,
			})
			return { ok: true, latencyMs: Date.now() - started }
		} catch (err) {
			const msg = err instanceof Error ? err.message : 'Failed to reach AI provider.'
			adminAiLog.warn({ err }, 'ai connection test failed')
			return { ok: false, error: msg }
		}
	})
