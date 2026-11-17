import { inArray } from 'drizzle-orm'

import type { Database } from '@/db'
import { appSettings } from '@/db/schema'
import { env } from '@/env'
import { decryptAppSecret, isEncryptedEnvelope } from '@/lib/crypto/app-secret'
import { createLogger } from '@/lib/logger'

import type { AiExtraSlot, AiSlot } from './ai-slots'
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
	// Which slot was asked for, and how it was filled (plan 34):
	// - 'default': the main config was asked for.
	// - 'inherited': the slot is empty, so this is the main config.
	// - 'model': the slot names a model on the main provider.
	// - 'provider': the slot has its own provider, key and model.
	// - 'misconfigured': the slot names a provider but is incomplete, so
	//   this is the main config. A broken slot must not take a feature down.
	slot: AiSlot
	slotMode: AiSlotMode
}

export type AiSlotMode = 'default' | 'inherited' | 'model' | 'provider' | 'misconfigured'

export const AI_SETTING_KEYS = {
	providerType: 'aiProviderType',
	baseUrl: 'aiBaseUrl',
	apiKey: 'aiApiKey',
	model: 'aiModel',
	maxOutputTokens: 'aiMaxOutputTokens',
} as const

// A slot stores the same four fields as the main config under its own
// keys. Max output tokens is shared and has no per-slot key.
export const AI_SLOT_SETTING_KEYS = {
	fast: { providerType: 'aiFastProviderType', baseUrl: 'aiFastBaseUrl', apiKey: 'aiFastApiKey', model: 'aiFastModel' },
	vision: { providerType: 'aiVisionProviderType', baseUrl: 'aiVisionBaseUrl', apiKey: 'aiVisionApiKey', model: 'aiVisionModel' },
} as const satisfies Record<AiExtraSlot, Record<AiSlotFieldName, string>>

export type AiSlotFieldName = 'providerType' | 'baseUrl' | 'apiKey' | 'model'
export type AiSlotSettingKey = (typeof AI_SLOT_SETTING_KEYS)[AiExtraSlot][AiSlotFieldName]

export type AiSettingKey = (typeof AI_SETTING_KEYS)[keyof typeof AI_SETTING_KEYS]

function slotEnv(slot: AiExtraSlot) {
	return slot === 'fast'
		? { providerType: env.AI_FAST_PROVIDER_TYPE, baseUrl: env.AI_FAST_BASE_URL, apiKey: env.AI_FAST_API_KEY, model: env.AI_FAST_MODEL }
		: {
				providerType: env.AI_VISION_PROVIDER_TYPE,
				baseUrl: env.AI_VISION_BASE_URL,
				apiKey: env.AI_VISION_API_KEY,
				model: env.AI_VISION_MODEL,
			}
}

async function loadDbAiSettings(db: Database, slot: AiSlot): Promise<Record<string, unknown>> {
	const keys: Array<string> = Object.values(AI_SETTING_KEYS)
	if (slot !== 'default') keys.push(...Object.values(AI_SLOT_SETTING_KEYS[slot]))
	const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys))
	const out: Record<string, unknown> = {}
	for (const row of rows) out[row.key] = row.value
	return out
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

// What the slot itself holds, before it is merged with the main config.
// The admin page shows these; features use `resolveAiConfig`.
export type AiSlotFields = {
	providerType: AiConfigField<ProviderType>
	baseUrl: AiConfigField
	apiKey: AiConfigField
	model: AiConfigField
}

function readSlotFields(slot: AiExtraSlot, dbRaw: Record<string, unknown>): AiSlotFields {
	const keys = AI_SLOT_SETTING_KEYS[slot]
	const fromEnv = slotEnv(slot)
	return {
		providerType: field<ProviderType>(fromEnv.providerType, providerTypeValue(dbRaw[keys.providerType])),
		baseUrl: field(fromEnv.baseUrl, stringValue(dbRaw[keys.baseUrl])),
		apiKey: field(fromEnv.apiKey, decryptApiKey(dbRaw[keys.apiKey])),
		model: field(fromEnv.model, stringValue(dbRaw[keys.model])),
	}
}

const warnedSlots = new Set<AiExtraSlot>()

// The config a feature should use. With no slot (or 'default') this is the
// main config, exactly as before slots existed. For 'fast' and 'vision' it
// is the slot merged over the main config:
//
// - empty slot: the main config.
// - model only: the main provider and key with the slot's model.
// - own provider: the slot's provider, base URL, key and model. Nothing is
//   borrowed from the main config except max output tokens, because a key
//   for one provider is useless on another.
// - own provider but incomplete: the main config, with one warning.
export async function resolveAiConfig(db: Database, slot: AiSlot = 'default'): Promise<ResolvedAiConfig> {
	const dbRaw = await loadDbAiSettings(db, slot)

	const providerType = field<ProviderType>(env.AI_PROVIDER_TYPE, providerTypeValue(dbRaw[AI_SETTING_KEYS.providerType]))
	const baseUrl = field(env.AI_BASE_URL, stringValue(dbRaw[AI_SETTING_KEYS.baseUrl]))
	const apiKey = field(env.AI_API_KEY, decryptApiKey(dbRaw[AI_SETTING_KEYS.apiKey]))
	const model = field(env.AI_MODEL, stringValue(dbRaw[AI_SETTING_KEYS.model]))
	const maxOutputTokens = fieldWithDefault(
		env.AI_MAX_OUTPUT_TOKENS,
		intValue(dbRaw[AI_SETTING_KEYS.maxOutputTokens]),
		DEFAULT_MAX_OUTPUT_TOKENS
	)

	const main = {
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
	if (slot === 'default') return { ...main, slot, slotMode: 'default' }

	const own = readSlotFields(slot, dbRaw)
	if (own.providerType.value) {
		const complete = isValidConfig({
			providerType: own.providerType.value,
			baseUrl: own.baseUrl.value,
			apiKey: own.apiKey.value,
			model: own.model.value,
		})
		if (complete) return { ...own, maxOutputTokens, isValid: true, slot, slotMode: 'provider' }
		if (!warnedSlots.has(slot)) {
			warnedSlots.add(slot)
			configLog.warn({ slot }, 'ai slot names a provider but is missing a key, model or base url; using the default config')
		}
		return { ...main, slot, slotMode: 'misconfigured' }
	}
	if (own.model.value) return { ...main, model: own.model, slot, slotMode: 'model' }
	return { ...main, slot, slotMode: 'inherited' }
}

// The slot's own fields and how it resolved, for the admin page.
export async function resolveAiSlotFields(db: Database, slot: AiExtraSlot): Promise<{ fields: AiSlotFields; resolved: ResolvedAiConfig }> {
	const [dbRaw, resolved] = await Promise.all([loadDbAiSettings(db, slot), resolveAiConfig(db, slot)])
	return { fields: readSlotFields(slot, dbRaw), resolved }
}

export function slotEnvLockedFlags(slot: AiExtraSlot) {
	const fromEnv = slotEnv(slot)
	return {
		providerType: Boolean(fromEnv.providerType),
		baseUrl: Boolean(fromEnv.baseUrl),
		apiKey: Boolean(fromEnv.apiKey),
		model: Boolean(fromEnv.model),
	}
}

export function _resetAiSlotWarningsForTesting(): void {
	warnedSlots.clear()
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
