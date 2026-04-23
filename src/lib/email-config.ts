import { inArray } from 'drizzle-orm'

import type { Database } from '@/db'
import { appSettings } from '@/db/schema'
import { env } from '@/env'
import { decryptAppSecret, isEncryptedEnvelope } from '@/lib/crypto/app-secret'
import { createLogger } from '@/lib/logger'

const configLog = createLogger('email-config')

export type FieldSource = 'env' | 'db' | 'missing'

export type EmailConfigField = {
	source: FieldSource
	value?: string
}

export type ResolvedEmailConfig = {
	apiKey: EmailConfigField
	fromEmail: EmailConfigField
	fromName: EmailConfigField
	bccAddress: EmailConfigField
	isValid: boolean
}

export const EMAIL_SETTING_KEYS = {
	apiKey: 'resendApiKey',
	fromEmail: 'resendFromEmail',
	fromName: 'resendFromName',
	bccAddress: 'resendBccAddress',
} as const

export type EmailSettingKey = (typeof EMAIL_SETTING_KEYS)[keyof typeof EMAIL_SETTING_KEYS]

async function loadDbEmailSettings(db: Database): Promise<Record<EmailSettingKey, unknown>> {
	const keys = Object.values(EMAIL_SETTING_KEYS)
	const rows = await db.select().from(appSettings).where(inArray(appSettings.key, keys))
	const out: Record<string, unknown> = {}
	for (const row of rows) out[row.key] = row.value
	return out as Record<EmailSettingKey, unknown>
}

function decryptApiKey(raw: unknown): string | undefined {
	if (raw == null) return undefined
	if (isEncryptedEnvelope(raw)) {
		try {
			return decryptAppSecret(raw)
		} catch (err) {
			configLog.error({ err }, 'failed to decrypt stored resend api key')
			return undefined
		}
	}
	// Defensive: if a plain string sneaks in (e.g. a pre-encryption row), accept
	// it so the admin can re-save it through the encrypted path.
	if (typeof raw === 'string' && raw.length > 0) return raw
	return undefined
}

function stringValue(raw: unknown): string | undefined {
	if (typeof raw === 'string' && raw.length > 0) return raw
	return undefined
}

function field(envValue: string | undefined, dbValue: string | undefined): EmailConfigField {
	if (envValue) return { source: 'env', value: envValue }
	if (dbValue) return { source: 'db', value: dbValue }
	return { source: 'missing' }
}

export async function resolveEmailConfig(db: Database): Promise<ResolvedEmailConfig> {
	const dbRaw = await loadDbEmailSettings(db)

	const apiKey = field(env.RESEND_API_KEY, decryptApiKey(dbRaw[EMAIL_SETTING_KEYS.apiKey]))
	const fromEmail = field(env.RESEND_FROM_EMAIL, stringValue(dbRaw[EMAIL_SETTING_KEYS.fromEmail]))
	const fromName = field(env.RESEND_FROM_NAME, stringValue(dbRaw[EMAIL_SETTING_KEYS.fromName]))
	const bccAddress = field(env.RESEND_BCC_ADDRESS, stringValue(dbRaw[EMAIL_SETTING_KEYS.bccAddress]))

	return {
		apiKey,
		fromEmail,
		fromName,
		bccAddress,
		isValid: Boolean(apiKey.value && fromEmail.value),
	}
}

export function envLockedFlags() {
	return {
		apiKey: Boolean(env.RESEND_API_KEY),
		fromEmail: Boolean(env.RESEND_FROM_EMAIL),
		fromName: Boolean(env.RESEND_FROM_NAME),
		bccAddress: Boolean(env.RESEND_BCC_ADDRESS),
	}
}
