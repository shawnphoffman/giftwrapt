import { inArray } from 'drizzle-orm'

import type { Database } from '@/db'
import { appSettings } from '@/db/schema'
import { env } from '@/env'
import { decryptAppSecret, isEncryptedEnvelope } from '@/lib/crypto/app-secret'
import { createLogger } from '@/lib/logger'

const configLog = createLogger('ai-config')

export type FieldSource = 'env' | 'db' | 'missing'

export type AiConfigField = {
	source: FieldSource
	value?: string
}

export type ResolvedAiConfig = {
	baseUrl: AiConfigField
	apiKey: AiConfigField
	model: AiConfigField
	isValid: boolean
}

export const AI_SETTING_KEYS = {
	baseUrl: 'aiBaseUrl',
	apiKey: 'aiApiKey',
	model: 'aiModel',
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

function field(envValue: string | undefined, dbValue: string | undefined): AiConfigField {
	if (envValue) return { source: 'env', value: envValue }
	if (dbValue) return { source: 'db', value: dbValue }
	return { source: 'missing' }
}

export async function resolveAiConfig(db: Database): Promise<ResolvedAiConfig> {
	const dbRaw = await loadDbAiSettings(db)

	const baseUrl = field(env.AI_BASE_URL, stringValue(dbRaw[AI_SETTING_KEYS.baseUrl]))
	const apiKey = field(env.AI_API_KEY, decryptApiKey(dbRaw[AI_SETTING_KEYS.apiKey]))
	const model = field(env.AI_MODEL, stringValue(dbRaw[AI_SETTING_KEYS.model]))

	return {
		baseUrl,
		apiKey,
		model,
		isValid: Boolean(baseUrl.value && apiKey.value && model.value),
	}
}

export function envLockedFlags() {
	return {
		baseUrl: Boolean(env.AI_BASE_URL),
		apiKey: Boolean(env.AI_API_KEY),
		model: Boolean(env.AI_MODEL),
	}
}
