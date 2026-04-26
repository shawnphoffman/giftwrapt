import { inArray } from 'drizzle-orm'

import type { Database } from '@/db'
import { appSettings } from '@/db/schema'
import { env } from '@/env'
import { decryptAppSecret, isEncryptedEnvelope } from '@/lib/crypto/app-secret'
import { createLogger } from '@/lib/logger'

import { DEFAULT_MAX_OUTPUT_TOKENS, type FieldSource, PROVIDER_TYPES, type ProviderType } from './ai-types'

export { DEFAULT_MAX_OUTPUT_TOKENS, PROVIDER_TYPES }
export type { FieldSource, ProviderType }

const configLog = createLogger('ai-config')

export type AiConfigField<T = string> = {
	source: FieldSource
	value?: T
}

export type ResolvedAiConfig = {
	providerType: AiConfigField<ProviderType>
	baseUrl: AiConfigField
	apiKey: AiConfigField
	model: AiConfigField
	maxOutputTokens: AiConfigField<number>
	isValid: boolean
}

export const AI_SETTING_KEYS = {
	providerType: 'aiProviderType',
	baseUrl: 'aiBaseUrl',
	apiKey: 'aiApiKey',
	model: 'aiModel',
	maxOutputTokens: 'aiMaxOutputTokens',
} as const

export type AiSettingKey = (typeof AI_SETTING_KEYS)[keyof typeof AI_SETTING_KEYS]

async function loadDbAiSettings(db: Database): Promise<Record<AiSettingKey, unknown>> {
	const keys = Object.values(AI_SETTING_KEYS)
	const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys))
	const out: Record<string, unknown> = {}
	for (const row of rows) out[row.key] = row.value
	return out as Record<AiSettingKey, unknown>
}

function decryptApiKey(raw: unknown): string | undefined {
	if (raw == null) return undefined
	if (isEncryptedEnvelope(raw)) {
		try {
			return decryptAppSecret(raw)
		} catch (err) {
			configLog.error({ err }, 'failed to decrypt stored ai api key')
			return undefined
		}
	}
	if (typeof raw === 'string' && raw.length > 0) return raw
	return undefined
}

function stringValue(raw: unknown): string | undefined {
	if (typeof raw === 'string' && raw.length > 0) return raw
	return undefined
}

function providerTypeValue(raw: unknown): ProviderType | undefined {
	if (typeof raw !== 'string') return undefined
	return PROVIDER_TYPES.find(t => t === raw)
}

function intValue(raw: unknown): number | undefined {
	if (typeof raw === 'number' && Number.isInteger(raw) && raw > 0) return raw
	if (typeof raw === 'string' && /^\d+$/.test(raw)) {
		const n = Number.parseInt(raw, 10)
		if (Number.isInteger(n) && n > 0) return n
	}
	return undefined
}

function field<T>(envValue: T | undefined, dbValue: T | undefined): AiConfigField<T> {
	if (envValue !== undefined) return { source: 'env', value: envValue }
	if (dbValue !== undefined) return { source: 'db', value: dbValue }
	return { source: 'missing' }
}

function fieldWithDefault<T>(envValue: T | undefined, dbValue: T | undefined, defaultValue: T): AiConfigField<T> {
	if (envValue !== undefined) return { source: 'env', value: envValue }
	if (dbValue !== undefined) return { source: 'db', value: dbValue }
	return { source: 'default', value: defaultValue }
}

function isValidConfig(args: {
	providerType: ProviderType | undefined
	baseUrl: string | undefined
	apiKey: string | undefined
	model: string | undefined
}): boolean {
	if (!args.providerType || !args.apiKey || !args.model) return false
	if (args.providerType === 'openai-compatible' && !args.baseUrl) return false
	return true
}

export async function resolveAiConfig(db: Database): Promise<ResolvedAiConfig> {
	const dbRaw = await loadDbAiSettings(db)

	const providerType = field<ProviderType>(env.AI_PROVIDER_TYPE, providerTypeValue(dbRaw[AI_SETTING_KEYS.providerType]))
	const baseUrl = field(env.AI_BASE_URL, stringValue(dbRaw[AI_SETTING_KEYS.baseUrl]))
	const apiKey = field(env.AI_API_KEY, decryptApiKey(dbRaw[AI_SETTING_KEYS.apiKey]))
	const model = field(env.AI_MODEL, stringValue(dbRaw[AI_SETTING_KEYS.model]))
	const maxOutputTokens = fieldWithDefault(
		env.AI_MAX_OUTPUT_TOKENS,
		intValue(dbRaw[AI_SETTING_KEYS.maxOutputTokens]),
		DEFAULT_MAX_OUTPUT_TOKENS
	)

	return {
		providerType,
		baseUrl,
		apiKey,
		model,
		maxOutputTokens,
		isValid: isValidConfig({
			providerType: providerType.value,
			baseUrl: baseUrl.value,
			apiKey: apiKey.value,
			model: model.value,
		}),
	}
}

export function envLockedFlags() {
	return {
		providerType: Boolean(env.AI_PROVIDER_TYPE),
		baseUrl: Boolean(env.AI_BASE_URL),
		apiKey: Boolean(env.AI_API_KEY),
		model: Boolean(env.AI_MODEL),
		maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS !== undefined,
	}
}
